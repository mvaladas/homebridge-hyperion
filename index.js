var net = require('net');
var Color = require('color');
var Service, Characteristic;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.hap.Accessory;
	uuid = homebridge.hap.uuid;

	homebridge.registerAccessory("homebridge-hyperion", "Hyperion", HyperionAccessory);
}

function HyperionAccessory(log, config) {
	this.log        = log;
	this.host       = config["host"];
	this.port       = config["port"];
	this.name       = config["name"];
	this.ambi_name  = config["ambilight_name"];
	this.priority   = parseInt(config["priority"]) || 100;
	this.blackPriority   = 10;
	this.color = Color();
	this.lightService;
	this.ambiService;
	this.infoService;
	this.ambiState = false;
	this.log("Starting Hyperion Accessory");
}

HyperionAccessory.prototype.sendColorCommand = function (color, priority) {
	var commands = [];
	commands.push({
		command: "color",
		priority: priority,
		color: color.rgbArray()
	});
	this.sendHyperionCommand(commands, function (jsonReply) {
		this.log.debug("Color Command Reply: " + jsonReply);
	}.bind(this));
}

HyperionAccessory.prototype.sendClearCommand = function (priority) {
	var commands = [];
	commands.push({
		command: "clear",
		priority: priority
	});
	this.sendHyperionCommand(commands, function (jsonReply) {
		this.log.debug("Clear Command Reply: " + jsonReply);
	}.bind(this));
}

HyperionAccessory.prototype.sendClearAllCommand = function (jsonReply) {
	var commands = [];
	commands.push({
		command: "clearall"
	});
	this.sendHyperionCommand(commands, function (jsonReply) {
		this.log.debug("ClearAll Command Reply: " + jsonReply);
	}.bind(this));
}

HyperionAccessory.prototype.sendServerInfoCommand = function (callback) {
	var commands = [];
	commands.push({
		command: "serverinfo",
	});
	this.sendHyperionCommand(commands, function (jsonReply) {
		this.log.debug("serverinfo Command Reply: " + jsonReply);
		callback(jsonReply)
	}.bind(this));
}

HyperionAccessory.prototype.sendGetColor = function (callback) {
	var commands = [];
	commands.push({
		command: "serverinfo",
	});
	this.sendServerInfoCommand( function (jsonReply) {
		if(jsonReply.info.activeLedColor.length == 0)
		{
			this.log.debug("No Color, defaulting to: " + this.getHSLCharacteristics());
			callback(this.getHSLCharacteristics());
		}
		else
		{
			this.log.debug("Got Color: " + jsonReply.info.activeLedColor[0]["HSL Value"]);
			h = jsonReply.info.activeLedColor[0]["HSL Value"][0];
			s = jsonReply.info.activeLedColor[0]["HSL Value"][1] * 100;
			l = jsonReply.info.activeLedColor[0]["HSL Value"][2] * 100;
			callback(Color().hsl([h,s,l]));
		}
	}.bind(this));
}

HyperionAccessory.prototype.sendHyperionCommand = function (commands, callback) {
	var client = new net.Socket();

	client.connect(this.port, this.host, function () {
		while (commands.length) {
			var current_command = commands.shift();
			jsonstr = JSON.stringify(current_command);
			this.log.debug("Sending JSON: " + jsonstr);
			client.write(jsonstr + "\n");
		}
	}.bind(this));

	var reply = "";
	client.on('data', function(data) {   
		reply += data;
		if(reply.slice(-1) == '\n')
		{
			//this.log.debug('JSON reply received: ' + reply);
			client.end();
			jsondata = JSON.parse(reply);
			callback(jsondata);
		}
	}.bind(this));

	client.on('error', function (err) {
		this.log("Could not send command '" + command + "' with color '" + color.rgbArray() + "'");
		this.log.debug(err)
	}.bind(this));

}

HyperionAccessory.prototype.getHSLCharacteristics = function () {
	// var h = this.lightService.getCharacteristic(Characteristic.Hue).value
	// var s = this.lightService.getCharacteristic(Characteristic.Saturation).value
	// var l = this.lightService.getCharacteristic(Characteristic.Brightness).value
	// return Color().hsl([h,s,l]);
	return this.color
}

HyperionAccessory.prototype.getPowerState = function (state, callback) {
	this.sendServerInfoCommand(function (jsonReply) { 
		priorities = jsonReply.info.priorities
		let blackPriority = priorities.find(priority => priority.priority == this.blackPriority)
		let colorPriority = priorities.find(priority => priority.priority == this.priority)
		if (blackPriority)
			this.lightService.updateCharacteristic(Characteristic.On, 0);
		else
		{
			if (colorPriority)
				this.lightService.updateCharacteristic(Characteristic.On, 1);
			else
				this.lightService.updateCharacteristic(Characteristic.On, 0);
		}
	}.bind(this));
}

HyperionAccessory.prototype.setPowerState = function (state, callback) {
	var color_to_set;

	if (state && this.lightService.getCharacteristic(Characteristic.On).value == 0)
	{
		this.log("Setting power state on the '" + this.name + "' to on");
		color_to_set = this.getHSLCharacteristics();
		this.sendClearCommand(this.blackPriority, function (jsonReply) { }.bind(this));
		this.sendColorCommand(color_to_set, this.priority, function (jsonReply) { }.bind(this));
	} 
	else if (!state && this.lightService.getCharacteristic(Characteristic.On).value == 1)
	{
		this.log("Setting power state on the '" + this.name + "' to off");
		this.sendColorCommand(Color().value(0), this.blackPriority, function (jsonReply) { }.bind(this));
		//this.sendClearCommand(color_to_set, this.blackPriority, function (jsonReply) { }.bind(this));
	}

}

HyperionAccessory.prototype.setBrightness = function (level, callback) {
	this.log("Setting brightness on the '" + this.name + "' to '" + level + "'");
	this.color = this.color.value(level);
	this.sendColorCommand(this.color, this.priority, function (err, new_color) {
	}.bind(this));
}

HyperionAccessory.prototype.getBrightness = function () {
	this.sendGetColor(function (new_color) { 
		this.log("Updating brightness to: " +  new_color.value());
		this.color = new_color;
		this.lightService.updateCharacteristic(Characteristic.Brightness, new_color.value());
	}.bind(this));
}

HyperionAccessory.prototype.setHue = function (level, callback) {
	this.log("Setting hue on the '" + this.name + "' to '" + level + "'");
	this.color = this.color.hue(level);
	this.sendColorCommand(this.color, this.priority, function (err, new_color) {
	}.bind(this));
}

HyperionAccessory.prototype.getHue = function () {
	this.sendGetColor(function (new_color) { 
		this.log("Updating Hue to: " +  new_color.hue());
		this.color = new_color;
		this.lightService.updateCharacteristic(Characteristic.Hue, new_color.hue());
	}.bind(this));
}

HyperionAccessory.prototype.setSaturation = function (level, callback) {
	this.log("Setting saturation on the '" + this.name + "' to '" + level + "'");
	this.color = this.color.saturationv(level);
	this.sendColorCommand(this.color, this.priority, function (err, new_color) {
	}.bind(this));
}

HyperionAccessory.prototype.getSaturation = function () {
	this.sendGetColor(function (new_color) { 
		this.log("Updating saturation to: " +  new_color.saturationv());
		this.color = new_color;
		this.lightService.updateCharacteristic(Characteristic.Saturation, new_color.saturationv());
	}.bind(this));
}

HyperionAccessory.prototype.setAmbiState = function (state, callback) {
	var command;

	if (state && this.ambiService.getCharacteristic(Characteristic.On).value == 0)
	{
		this.log("Setting ambi state on the '" + this.name + "' to on");
		this.lightService.updateCharacteristic(Characteristic.On, 0);
		this.sendClearAllCommand(function (reply) {});
	}
	else if (!state && this.ambiService.getCharacteristic(Characteristic.On).value == 1)
	{
		this.log("Setting ambi state on the '" + this.name + "' to off");
		this.sendColorCommand(Color().value(0), this.blackPriority, function (jsonReply) { }.bind(this));
	}
}

HyperionAccessory.prototype.getServices = function () {

	var availableServices = [];

	this.lightService = new Service.Lightbulb(this.name);
	availableServices.push(this.lightService);

	this.lightService
		.getCharacteristic(Characteristic.On)
		.onSet(async (value) => {
			if (this.ambi_name && value
				&& this.ambiService.getCharacteristic(Characteristic.On).value == 1) {
				this.log("Setting ambi state to: " + 0);
				this.ambiService.updateCharacteristic(Characteristic.On, 0);
			}
			this.setPowerState(value, null);
		})
		.onGet(async (value) => {
			this.log.debug("Getting Power: ");
			this.getPowerState();
			return this.getHSLCharacteristics().value() > 0;
		});

	this.lightService
		.addCharacteristic(Characteristic.Brightness)
		.onSet(async (value) => {
			if (this.ambi_name && value > 0 && 
				this.ambiService.getCharacteristic(Characteristic.On).value == 1) {
				this.log("Setting ambi state to: " + 0);
				this.ambiService.updateCharacteristic(Characteristic.On, 0);
			}
			this.setBrightness(value,null);
		})
		.onGet(async () => {
			this.log.debug("Getting Bright: ");
			this.getBrightness();
			return this.getHSLCharacteristics().value();
		});

	this.lightService
		.addCharacteristic(Characteristic.Hue)
		.onSet(async (value) => {
			if (this.ambi_name && this.ambiService.getCharacteristic(Characteristic.On).value == 1) {
				this.ambiService.updateCharacteristic(Characteristic.On, 0);
				this.lightService.updateCharacteristic(Characteristic.On, 1);
				this.log("Setting ambi state to: " + 0);
			}
			this.setHue(value,null);
		})
		.onGet(async () => {
			this.log.debug("Getting Hue: ");
			this.getHue();
			return this.getHSLCharacteristics().hue();
		});

	this.lightService
		.addCharacteristic(Characteristic.Saturation)
		.onSet(async (value) => {
			if (this.ambi_name && 
				this.ambiService.getCharacteristic(Characteristic.On).value == 1) {
				this.log("Setting ambi state to: " + 0);
				this.ambiService.updateCharacteristic(Characteristic.On, 0);
			}
			this.setSaturation(value,null);
		})
		.onGet(async () => {
			this.log.debug("Getting Sat: ");
			this.getSaturation();
			return this.getHSLCharacteristics().saturationv();
		});


	if (this.ambi_name) {
		this.ambiService = new Service.Switch(this.ambi_name);

		availableServices.push(this.ambiService);

		this.ambiService
			.getCharacteristic(Characteristic.On)
			.onSet(async (value) => {
				this.setAmbiState(value,null);
			})
			.onGet(async () => {
				return this.ambiState;
			});
	}

	this.infoService = new Service.AccessoryInformation();
	availableServices.push(this.infoService);

	this.infoService
		.setCharacteristic(Characteristic.Manufacturer, "Hyperion")
		.setCharacteristic(Characteristic.Model, this.host)
		.setCharacteristic(Characteristic.SerialNumber, this.lightService.UUID);

	return availableServices;
}

