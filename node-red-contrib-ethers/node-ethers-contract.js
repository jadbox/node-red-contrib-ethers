module.exports = function(RED) {

    // CREDENTIALS
    RED.nodes.registerType("ethers-contract", function(config){
        RED.nodes.createNode(this, config);
        let node = this;

        this.name        = config.name;
        this.address     = config.address;
        // this.transaction = config.transaction;
        this.abi         = config.abi;
        // this.bin         = config.bin;
    }, {});
    
}