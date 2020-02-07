const helper         = require('node-red-viseo-helper');
const Eth            = require('ethjs')
const ethers            = require('ethers');
const etherscan            = require('etherscan-api');
// const fetch = require('node-fetch');
const SignerProvider = require('ethjs-provider-signer');
const sign           = require('ethjs-signer').sign;
const MAX_GAS        = 300000;

/*
TODO: params on msg input object (by order or attr name? both?)
*/

// --------------------------------------------------------------------------
//  NODE-RED
// --------------------------------------------------------------------------


let cacheNode = null;
module.exports = function(RED) {
    const register = function(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        cacheNode = node;
        node.status({});

        if (!config.network)  { node.status({fill:"red", shape:"ring", text: 'Missing network'}); }
        else                  { node.network = RED.nodes.getNode(config.network); }

        if (!config.wallet)   { node.status({fill:"red", shape:"ring", text: 'Missing wallet'}); }
        else                  { node.wallet = RED.nodes.getNode(config.wallet); }

        if (!config.contract)  { node.status({fill:"red", shape:"ring", text: 'Missing contract'}); }
        else {
            node.contract = RED.nodes.getNode(config.contract); 
        }

        if (node.network && node.contract){
            this.on('input', (data)  => { input(node, data, config) });
        }
    }
    RED.nodes.registerType("ethers-transaction", register, {});


    RED.httpAdmin.post("/abi", RED.auth.needsPermission('ethers-contract.read'), async function(req,res) {
        // const _contract = node.contract = RED.nodes.getNode(config.contract);
        const addr = req.body.address;
        console.log('serialports', addr);

        res.json({ funcs: await getABI(addr) });
    });
}

async function getABI(address) {
    if(!cacheNode) return;

    const gVar = cacheNode.context().global;
    const ekey = gVar.get('etherscan_key');
    const api = etherscan.init(ekey,'kovan', 3000);
    const contract_id = address; // '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa';

    // const network = true?'-kovan':'';
    // const r = await fetch(`http://api${network}.etherscan.io/api?module=contract&action=getabi&address=${contract_id}&apikey=${ekey}`);
    // const r2 = await r.json();
    // console.log('r2', r2);

    const abi = await api.contract
        .getabi(contract_id);

    const abi2 = abi.result;

    // const r2 = ethers.utils.defaultAbiCoder;
    var iface = new ethers.utils.Interface(abi2)

    // console.log('iface', iface.functions);
    const abiFunctions = iface.abi.filter(x=>x.type==='function');
    // const abiNotPayable = abiFunctions.filter(x=>x.payable===false).map(x=>x.name);
    // const abiPayable = abiFunctions.filter(x=>x.payable===true).map(x=>x.name);

    return abiFunctions;
}

const input = async (node, data, config) => {
    // console.log(node,'---\n', data, '----\n')
    console.log(config);
    const params = config.params;

    console.log('params', params);
    if(!params) {
        console.log('no params');
        return;
    }

    // return;

    const gVar = node.context().global;
    const ekey = gVar.get('etherscan_key');
    const api = etherscan.init(ekey,'kovan', 3000);
    const contract_id = node.contract.address; // '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa';

    // const network = true?'-kovan':'';
    // const r = await fetch(`http://api${network}.etherscan.io/api?module=contract&action=getabi&address=${contract_id}&apikey=${ekey}`);
    // const r2 = await r.json();
    // console.log('r2', r2);

    const abi = await api.contract
        .getabi(contract_id);

    const abi2 = abi.result;

    // const r2 = ethers.utils.defaultAbiCoder;
    var iface = new ethers.utils.Interface(abi2)

    // console.log('iface', iface.functions);
    const abiFunctions = iface.abi.filter(x=>x.type==='function');
    const abiNotPayable = abiFunctions.filter(x=>x.payable===false).map(x=>x.name);
    const abiPayable = abiFunctions.filter(x=>x.payable===true).map(x=>x.name);
    const abiFuncts = { payble: abiPayable, notpayble: abiNotPayable };

    console.log(abiFuncts);

    const funcName = config.apiCall; // 'balanceOf';
    const inputsFunc = params; // ['0x1fe0c4488fd3f3f70204d5709945bc4b0a99672e'];

    console.log('name getParams', funcName, inputsFunc);
    // console.log('name setParamInputs', setParamInputs(funcName));

    // console.log('abi', abi2);
    // const abi = TEST_ABI;

    const provider = ethers.getDefaultProvider('kovan');
    
    contract = new ethers.Contract(contract_id, abi2, provider);
    let tx = await contract[funcName].apply(contract, inputsFunc);

    const result2 = tx.toString();
    // String or Object?

    // node.log(tx);
    console.log('result2', result2);
    // console.log('node.contract', node.contract.address);
    node.send({payload: result2});
    return;
}