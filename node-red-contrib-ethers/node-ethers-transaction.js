const ethers = require('ethers');
const etherscan = require('etherscan-api');

// const MAX_GAS = 300000;

// --------------------------------------------------------------------------
//  NODE-RED
// --------------------------------------------------------------------------


let cacheNode = null;
module.exports = function (RED) {
    const register = function (config) {
        RED.nodes.createNode(this, config);
        let node = this;
        cacheNode = node;
        node.status({});

        if (!config.network) { node.status({ fill: "red", shape: "ring", text: 'Missing network' }); }
        else { node.network = RED.nodes.getNode(config.network); }

        if (!config.wallet) { node.status({ fill: "red", shape: "ring", text: 'Missing wallet' }); }
        else { node.wallet = RED.nodes.getNode(config.wallet); }

        if (!config.contract) { node.status({ fill: "red", shape: "ring", text: 'Missing contract' }); }
        else {
            node.contract = RED.nodes.getNode(config.contract);
        }

        if (node.network && node.contract) {
            this.on('input', (data) => { input(RED, node, data, config) });
        }
    }
    RED.nodes.registerType("ethers-transaction", register, {});


    RED.httpAdmin.post("/abi", RED.auth.needsPermission('ethers-contract.read'), async function (req, res) {
        // const _contract = node.contract = RED.nodes.getNode(config.contract);
        const addr = req.body.address;
        console.log('serialports', addr);

        res.json({ funcs: await getABIFuncs(addr) });
    });
}

async function getABIFuncs(address) {
    if (!cacheNode) return;

    const abi2 = await getABI(cacheNode, address);
    var iface = new ethers.utils.Interface(abi2)

    // console.log('iface', iface.functions);
    const abiFunctions = iface.abi.filter(x => x.type === 'function');

    return abiFunctions;
}

const abiCache = {};
const getABI = async (node, contract) => {
    if (abiCache[contract]) {
        // console.log('etherscan use cache', contract);
        return abiCache[contract];
    }
    node.log(`etherscan_for ${contract}`);
    const gVar = node.context().global;
    const ekey = gVar.get('etherscan_key');
    const api = etherscan.init(ekey, 'kovan', 3000);

    const abiCall = await (api.contract
        .getabi(contract));

    const result = abiCall.result;

    return abiCache[contract] = result;
}

const input = async (RED, node, data, config) => {
    // console.log(node,'---\n', data, '----\n')
    const payload = data.payload || {};
    // let payloadConf = payload.config || {};
    // let payloadParams = payloadConf.params || [];

    // console.log('msg', config);
    // console.log('payload params', payloadParams);
    // console.log(config);

    const configParams = config.params;
    // const len = Math.max(configParams.length, payloadParams.length);

    const params = configParams.map((x, i) => {
        if (x && x.indexOf('payload') === 0) {
            return RED.util.getMessageProperty(data, x);
        }
        return x;
    });

    const contractAddr = node.contract.address;

    /* if (!params) {
        console.log('no params object');
        return;
    } */

    node.log(`call ${contractAddr} with: ${params}`);

    const abi = await getABI(node, contractAddr);

    const funcName = config.apiCall; // 'balanceOf';

    // console.log('name getParams', funcName, params);
    // console.log('name setParamInputs', setParamInputs(funcName));
    // console.log('abi', abi);

    const provider = ethers.getDefaultProvider('kovan');

    contract = new ethers.Contract(contractAddr, abi, provider);
    let tx = await contract[funcName].apply(contract, params); // ['0x1fe0c4488fd3f3f70204d5709945bc4b0a99672e'];

    const result = tx.toString();
    // String or Object?

    // node.log(tx);
    node.log(`result ${contractAddr}: ${result}`);

    node.send({ payload: result });
    return;
}