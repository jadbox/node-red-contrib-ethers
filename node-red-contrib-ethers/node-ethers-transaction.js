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

        // if (!config.wallet) { node.status({ fill: "red", shape: "ring", text: 'Missing wallet' }); }
        // else { }
        node.wallet = RED.nodes.getNode(config.wallet); 

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
    
    const gVar = node.context().global;
    const ekey = gVar.get('etherscan_key');

    node.network.url = node.network ? node.network.url : undefined; //  || 'kovan'

    node.log(`etherscan_for ${contract} net:${node.network.url}`);

    console.log('call')

    const api = etherscan.init(ekey, node.network.url || undefined, 3000);

    const abiCall = await (api.contract
        .getabi(contract));

    const result = abiCall.result;

    return abiCache[contract] = result;
}

const input = async (RED, node, data, config) => {
    // console.log(node,'---\n', data, '----\n')
    // const payload = data.payload || {};
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

    if(!node.network) {
        return;
    }

    node.log(`Connecting to ${node.network.url}`);

    const abi = await getABI(node, contractAddr);

    const funcName = config.apiCall; // 'balanceOf';

    // console.log('name getParams', funcName, params);
    // console.log('name setParamInputs', setParamInputs(funcName));
    // console.log('abi', abi);

    // TODO make provider configurable
    
    const provider = ethers.getDefaultProvider(node.network.url || 'kovan');


    contract = new ethers.Contract(contractAddr, abi, provider);

    
    let contractWithMaybeSigner = contract;
    let isSign = false;
    // console.log('node.wallet', node.wallet);
    if(node.wallet && node.wallet.credentials.keyPrivate) {
        node.log(`signing via wallet pub addr: ${node.wallet.keyPublic}`);
        console.log('pv', node.wallet.credentials.keyPrivate);
        const wallet = new ethers.Wallet(node.wallet.credentials.keyPrivate, provider) 
        contractWithMaybeSigner = contract.connect(wallet);
        isSign = true;
    }

    const paymentString = getPropByType(RED, config, data, 'ether');
    const payment = paymentString ? ethers.utils.parseEther(paymentString) : undefined;

    const paramsWithOverrides = params.concat([{
            // The address to execute the call as
        from: getPropByType(RED, config, data, 'address') || undefined, // "0x0123456789012345678901234567890123456789",

        // The maximum units of gas for the transaction to use
        // gasPrice: node.gasPrice || undefined,
        gasLimit: getPropByType(RED, config, data, 'gaslimit') || undefined,
        // value: node.ether || undefined,
        value: payment
    }]);

    node.log(`call ${contractAddr} with: ${JSON.stringify(paramsWithOverrides)}`);

    const tx = await contractWithMaybeSigner[funcName](...paramsWithOverrides); // ['0x1fe0c4488fd3f3f70204d5709945bc4b0a99672e'];

    let result = "";
    if(isSign) {
        // See: https://ropsten.etherscan.io/tx/0xaf0068dcf728afa5accd02172867627da4e6f946dfb8174a7be31f01b11d5364
        node.log(`Waiting on transaction: ${tx.hash}`);
        // "0xaf0068dcf728afa5accd02172867627da4e6f946dfb8174a7be31f01b11d5364"

        // The operation is NOT complete yet; we must wait until it is mined
        await tx.wait();
        node.log(`Finished transaction: ${tx.hash}`);
        result = tx.hash;
    } else {
        result = tx.toString();
    }
    // String or Object?

    // node.log(tx);
    node.log(`result ${contractAddr}: "${result}"`);

    let msg = {  };
    RED.util.setMessageProperty(msg, config.output || 'payload', result, true);
    // console.log('-', msg, config.output, result);
    // console.log('msgOutput');
    node.send(msg);
    return;
}

const getPropByType = (RED, obj, data, prop) => {
    // node[prop] && 
    const x = obj[prop];
    let r = (x!==undefined && x.indexOf('payload') === 0 ) ? RED.util.getMessageProperty(data, x) : x;
    if(r === "" || r === null) r = undefined;
    // if(x) console.log('looking prop', prop, 'x:', x, 'r:', r);
    return r;
}