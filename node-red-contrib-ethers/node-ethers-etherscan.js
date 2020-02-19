module.exports = function(RED) {
    RED.nodes.registerType("ethers-etherscan", function(config){
        RED.nodes.createNode(this, config);

        let node = this;
        this.name        = config.name;
        this.keyPrivate = this.credentials.keyPrivate;
        // console.log('registerType', node, config);
    }, {
        credentials: {
			keyPrivate: { type: "text" }
    	}
    });
    
}