module.exports = function(RED) {

    // CREDENTIALS
    RED.nodes.registerType("ethers-wallet", function(config){
        RED.nodes.createNode(this, config);
        this.name      = config.name
        this.keyPublic = config.keyPublic
    }, {
        credentials: {
			keyPrivate: { type: "text" },
    	}
    });
}