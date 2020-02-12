module.exports = function(RED) {

    // CREDENTIALS
    RED.nodes.registerType("ethers-network", function(config){
        RED.nodes.createNode(this, config);
        this.name        = config.name;
        this.url         = config.url;
        this.description = config.description;
    }, {
        credentials: {
			etherScanKeyPrivate: { type: "text" },
    	}
    });
}