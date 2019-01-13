var events    = require('events');
var util      = require('util');
var request   = require('request');
var progress = require('request-progress');
var fs = require('fs');
var path = require('path');
var moment = require('moment');
var http = require('http')

var log4js = require('log4js');
var logger = log4js.getLogger();
log4js.configure({
  appenders: { 
    file: { type: 'file', filename: path.join(__dirname, 'log/app.log') }
  },
  categories: { default: { appenders: ['file'], level: 'debug' } }
});

var options = {
	host	: '',
	port 	: '',
	user 	: '',
	pass 	: '',
	log 	: true
};

var httpReq = function(body){
	return new http.ClientRequest({
		hostname: "",
		port: 8080,
		path: "/some/path",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(body)
		}
	})
}


var nvrcam = require('./nvrcam.js');

console.log("======================mapping======================");
console.log(nvrcam.mapping);
console.log("======================mapping======================");

var findIp = function(index){
	for(var i = 0;i < nvrcam.mapping.length; i++){
		if(nvrcam.mapping[i].nvr == options.host && nvrcam.mapping[i].camIndex == index){
			return nvrcam.mapping[i].ip;
		}
	}
	
	return null;
}



var TRACE   = true;
var BASEURI   = false;


var dahua = function(options) {
  
  events.EventEmitter.call(this);
  TRACE = options.log;
  BASEURI = 'http://'+ options.host + ':' + options.port;
  USER = options.user;
  PASS = options.pass;
  HOST = options.host;

  if( options.cameraAlarms === undefined ) {
    options.cameraAlarms = true;
  } 

  if( options.cameraAlarms ) { this.client = this.connect(options) };

  this.on('error',function(err){
    logger.debug("Error: " + err);
  });

};

util.inherits(dahua, events.EventEmitter);

// set up persistent connection to recieve alarm events from camera
dahua.prototype.connect = function(options) {
  
    var self = this;

	//[VideoMotion,VideoLoss,VideoBlind,AlarmLocal,CrossLineDetection,CrossRegionDetection,LeftDetection,TakenAwayDetection,VideoAbnormalDetection,FaceDetection,AudioMutation,AudioAnomaly,VideoUnFocus,WanderDetection,RioterDetection,ParkingDetection,MoveDetection]',
    var opts = {
      'url' : BASEURI + '/cgi-bin/eventManager.cgi?action=attach&codes=[CrossRegionDetection]',
	  //'url':BASEURI+'/cgi-bin/eventManager.cgi?action=getEventIndexes&code=AlarmLocal',
      'forever' : true,
      'headers': {'Accept':'multipart/x-mixed-replace'}
    };

    var client = request(opts).auth(USER,PASS,false);

    client.on('socket', function(socket) {
		console.log("socket");
      
    });

    client.on('response', function() {  
	//console.log("got response");
      handleDahuaEventConnection(self,options);
    });

    client.on('error', function(err) {
		//console.log("got error");
      handleDahuaEventError(self, err);
    });

    client.on('data', function(data) {
		//console.log("got data");
       handleDahuaEventData(self, data);
    });

    client.on('close', function() {   // Try to reconnect after 30s
	console.log("closed");
      setTimeout(function() { self.connect(options); }, 30000 );
      handleDahuaEventEnd(self);
    });
};

function handleDahuaEventData(self, data) {
  //if (TRACE)  logger.debug('Data: ' + data.toString());
  //console.log(data.toString());
  data = data.toString().split('\r\n');
  var i = Object.keys(data);
  i.forEach(function(id){
	//logger.debug(data[id]);
	//console.log(data[id]);
    if (data[id].startsWith('Code=')) {
      var alarm = data[id].split(';');
      var code = alarm[0].substr(5);
      var action = alarm[1].substr(7);
      var index = alarm[2].substr(6);
      self.emit("alarm", code,action,index);
    }
  });
}

function handleDahuaEventConnection(self,options) {
  if (TRACE)  logger.debug('Connected to ' + options.host + ':' + options.port);
  //self.socket = socket;
  self.emit("connect");
}

function handleDahuaEventEnd(self) {
  if (TRACE)  logger.debug("Connection closed!");
  self.emit("end");
}

function handleDahuaEventError(self, err) {
  if (TRACE)  logger.debug("Connection error: " + err);
  self.emit("error", err);
}


var d 	= new dahua(options);
d.on('alarm', function(code,action,index) {
	var cnl = parseInt(index)+1;
	console.log('channel:'+cnl+ ","+new Date());
	logger.debug('New Event'+'index:'+index + ",action:"+action+",code:"+code);
	//logger.debug('Video Motion Detected' +'index:'+index);
		
	var ip = findIp(index);
	if(ip == null){
		return ;
	}
	
	//console.log('ip :'+ip);
	logger.debug('ip :'+ip);
	
	
	var body = JSON.stringify({
		Ip:ip,
		EventName:code
	});

	var request = httpReq(body);
	request.end(body);
	
	console.log("sent to http server ");
	logger.debug("sent event to http server ");
});


