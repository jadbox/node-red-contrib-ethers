const helper         = require('node-red-viseo-helper');
const Eth            = require('ethjs')
const ethers            = require('ethers');
const etherscan            = require('etherscan-api');
const fetch = require('node-fetch');
const SignerProvider = require('ethjs-provider-signer');
const sign           = require('ethjs-signer').sign;
const MAX_GAS        = 300000;

/*
TODO: params on msg input object (by order or attr name? both?)
*/

// --------------------------------------------------------------------------
//  NODE-RED
// --------------------------------------------------------------------------

module.exports = function(RED) {
    const register = function(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.status({});

        if (!config.network)  { node.status({fill:"red", shape:"ring", text: 'Missing network'}); }
        else                  { node.network = RED.nodes.getNode(config.network); }

        if (!config.wallet)   { node.status({fill:"red", shape:"ring", text: 'Missing wallet'}); }
        else                  { node.wallet = RED.nodes.getNode(config.wallet); }

        if (config.contract)  { node.contract = RED.nodes.getNode(config.contract); }

        if (node.network){
            this.on('input', (data)  => { input(node, data, config) });
        }
    }
    RED.nodes.registerType("ethers-transaction", register, {});
}

const input = async (node, data, config) => {
    const gVar = node.context().global;
    const ekey = gVar.get('etherscan_key');
    const api = etherscan.init(ekey,'kovan', 3000);
    const contract_id = '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa';

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

    const getParams = (name)=>{
        return iface.abi.filter(x=>x.type==='function' && x.name === name)[0];
    }

    const setParamInputs = (name)=> {
        return getParams(name).inputs.map(mi => mi.name || mi.type );
    }

    const funcName = 'balanceOf';
    const inputsFunc = ['0x87e76b0a50efc20259cafe0530f75ae0e816aaf2'];

    console.log('name getParams', getParams(funcName));
    console.log('name setParamInputs', setParamInputs(funcName));

    // console.log('abi', abi2);
    // const abi = TEST_ABI;

    const provider = ethers.getDefaultProvider('kovan');
    
    contract = new ethers.Contract(contract_id, abi2, provider);
    let tx = await contract[funcName].apply(contract, inputsFunc);

    const result2 = tx.toString();
    // String or Object?

    // node.log(tx);
    console.log('123', result2);
    return;

    // Build eth object to sign transaction
    let eth = getEth(node.network.url, node.wallet.credentials.keyPrivate, node.wallet.keyPublic);

    // If there is a Contract, apply the contract
    if (node.contract) {
        let txObject = { from: node.wallet.keyPublic, gas: MAX_GAS }
        findContract(eth, node.contract, txObject, (err, contract) => { 
            if (err){ return node.warn(err);  }
            data.contract = contract;

            let func = contract[config.apiCall]
            let aArgs = [];
            if (config.param1){ aArgs.push(helper.resolve(config.param1, data, config.param1)) }
            if (config.param2){ aArgs.push(helper.resolve(config.param2, data, config.param2)) }
            if (config.param3){ aArgs.push(helper.resolve(config.param3, data, config.param3)) }
            
            func.apply(this, aArgs).then((result) => {
                
                let cb = (err, t) => { 
                    if (err) return node.warn(err);
                    let value = config.unit ? Eth.fromWei(result, config.unit) : result
                    helper.setByString(data, config.output || 'payload', value)
                    node.send(data);
                }
    
                if (!config.wait){ return cb() }
                waitTransaction(eth, result, cb)

            }).catch((error) => { node.warn(error); });
        })
        return;
    }

    // Otherwise call ethereum transaction 
    let address = node.wallet.keyPublic
    if (config.address){
        address = helper.getByString(data, config.address, config.address);
    }

    let wei = undefined;
    if (config.ether){
        wei = helper.getByString(data, config.ether, config.ether);
    }
    
    // Balance or Transaction ?
    if (!wei){
        let isAccount = address.length <= 42
        let promise = isAccount ? eth.getBalance(address)
                                : eth.getTransactionByHash(address)

        promise.then((result) => { 
            result = isAccount ? Eth.fromWei(result, 'wei') : result
            helper.setByString(data, config.output || 'payload', result)
            node.send(data);
        }).catch((err) => { node.warn(err) })
        
    } else { 

        eth.sendTransaction({
            from: node.wallet.keyPublic,
            to:   address,
            value: wei, gas: MAX_GAS, data: '0x',
        }).then((transAddr) => { 

            let cb = (err, result) => {
                if (err) return node.warn(err);
                helper.setByString(data, config.output || 'payload', result)
                node.send(data);
            }

            if (!config.wait){ return cb() }
            waitTransaction(eth, transAddr, cb)

        }).catch((err) => { node.warn(err) })

    }
}

// ------------------------------------------
//  HELPERS
// ------------------------------------------

const getEth = (networkURL, keyPrivate, keyPublic) => {
    let txConfig = {}
    if (keyPrivate){ txConfig.signTransaction = (rawTx, cb) => cb(null, sign(rawTx, keyPrivate)) }
    if (keyPublic) { txConfig.accounts = (cb) => cb(null, [keyPublic]) }
    const provider = new SignerProvider(networkURL, txConfig);
    return new Eth(provider);
}

const findContract = (eth, contract, txObject, callback) => {

    // Build contract
    const abi      = JSON.parse(contract.abi);
    const bytecode = contract.bin;

    const Contract = eth.contract(abi, bytecode, txObject);
    let _contract = undefined;

    // Retrieve from contract Address
    if (contract.address){
        _contract = Contract.at(contract.address);
        return callback(undefined, _contract);
    }

    // Retrieve from contract Transaction
    else if (contract.transaction){
        eth.getTransactionReceipt(contract.transaction).then((result) => { 
            
            console.log('Retrieve contract from transaction: ' + contract.address + ' is ' + result.contractAddress)
            _contract = Contract.at(result.contractAddress);
            callback(undefined, _contract);
    
        }).catch((error) => { callback(error); });
    }
}

const waitTransaction = (eth, address, callback, _max) => {
    if (_max === 0){ return callback('Timeout waiting transaction') }
    if (_max === undefined) { max = 10; }
    eth.getTransactionByHash(address)
       .then((t) => {
           if (t.blockNumber){ return callback(undefined, t); }
           setTimeout(() => { waitTransaction(eth, address, callback, _max-1) }, 1000)
       })
       .catch((err) => { return callback(err) })
}

const TEST_ABI = `[{"inputs":[{"internalType":"uint256","name":"chainId_","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"guy","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":true,"inputs":[{"indexed":true,"internalType":"bytes4","name":"sig","type":"bytes4"},{"indexed":true,"internalType":"address","name":"usr","type":"address"},{"indexed":true,"internalType":"bytes32","name":"arg1","type":"bytes32"},{"indexed":true,"internalType":"bytes32","name":"arg2","type":"bytes32"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"}],"name":"LogNote","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"dst","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Transfer","type":"event"},{"constant":true,"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"burn","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"guy","type":"address"}],"name":"deny","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"mint","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"move","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"holder","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"expiry","type":"uint256"},{"internalType":"bool","name":"allowed","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"pull","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"push","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"guy","type":"address"}],"name":"rely","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"version","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"wards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}]`;