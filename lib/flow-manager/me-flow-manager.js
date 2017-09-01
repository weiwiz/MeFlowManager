/**
 * Created by jacky on 2017/2/4.
 */
'use strict';
var tv4 = require('tv4');
var fs = require('fs');
var path = require('path');
var request = require('sync-request');
var util = require("util");
var _ = require('lodash');
var timerTemplate = require('./timer-template.json');
var meshbluTemplate = require('./meshblu-template.json');
var switchTemplate = require('./switch-template.json');
var functionTemplate = require('./function-template.json');
var VirtualDevice = require('../virtual-device').VirtualDevice;
var logger = require('../mlogger/mlogger');
var configurator = require('./../configurator');
var USER_TYPE_ID = '060A08000000';
var DISTANCE_X = 200;
var DISTANCE_Y = 60;
var PLUGIN_TYPE = {
    id: '060708060001',
    name: 'flowManager',
    icon: ''
};

var OPERATION_SCHEMAS = {
    "authToken": {
        "type": "object",
        "properties": {
            "userName": {"type": "string"},
            "password": {"type": "string"}
        },
        "required": ["userName", "password"]
    },
    "installNode": {
        "type": "object",
        "properties": {
            "module": {"type": "string"}
        },
        "required": ["module"]
    },
    "getAllTimer": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getUserSheet": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getNodeModule": {
        "type": "object",
        "properties": {
            "moduleId": {"type": "string"}
        },
        "required": ["moduleId"]
    },
    "deleteNodeModule": {
        "type": "object",
        "properties": {
            "moduleId": {"type": "string"},
            "flag":{"type":"boolean"}
        },
        "required": ["moduleId", "flag"]
    },
    "deleteFlow": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"},
            "flowId": {"type": "string"}
        },
        "required": ["userUuid", "flowId"]
    },
    "deleteUserSheet": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getFlowSwitch": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getFlowIdSplitter": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getMeshbluIn": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getMyFlows": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "getFlowDetail": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"},
            "flowId": {"type": "string"}
        },
        "required": ["userUuid", "flowId"]
    },
    "addFlow": {
        "type": "object",
        "properties": {
            "timeZoneOffset": {
                "type": "integer",
                "default": 0
            },
            "enable": {"type": "boolean"},
            "userUuid": {"type": "string"},
            "timerId": {"type": "string"},
            "newTimer": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "interval": {"type": "number"},
                    "between": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "weekday": {
                        "type": "array",
                        "items": {
                            "type": "number",
                            "enum": [0, 1, 2, 3, 4, 5, 6]
                        }
                    }
                }
            },
            "mode": {
                "type": "string",
                "enum": [
                    "SERIES",
                    "PARALLEL",
                    "WATERFALL"
                ]
            },
            "flow": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "deviceUuid": {"type": "string"},
                        "cmdName": {"type": "string"},
                        "cmdCode": {"type": "string"},
                        "parameters": {
                            "type": "object"
                        }
                    },
                    "required": ["deviceUuid", "cmdName", "cmdCode", "parameters"]
                }
            }
        },
        "required": ["enable", "userUuid"]
    },
    "addSheet": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"}
        },
        "required": ["userUuid"]
    },
    "executeFlow": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"},
            "flowId": {"type": "string"}
        },
        "required": ["userUuid", "flowId"]
    },
    "disableFlow": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"},
            "flowId": {"type": "string"}
        },
        "required": ["userUuid", "flowId"]
    },
    "enableFlow": {
        "type": "object",
        "properties": {
            "userUuid": {"type": "string"},
            "flowId": {"type": "string"}
        },
        "required": ["userUuid", "flowId"]
    }
};

/*
 * generate new id for nodeRed module
 * */
function getId() {
    return (1 + Math.random() * 4294967295).toString(16);
}
/*
 * clone json object
 * */
function jsonClone(jsonObj) {
    return JSON.parse(JSON.stringify(jsonObj));
}

function getErrorInfo(code) {
    return logger.getErrorInfo(code);
}

/*
 * Get the active flow configuration
 @param {object} self: self reference.
 @return [object] flows: flow configurations:
 @exception Error.
 * */
function getFlowConfigurations(self) {
    var reqUrl = "http://" + self.host + ":" + self.port + "/flows";
    var opt = {
        headers: {
            //"Authorization": self.tokenInfo.token_type + " " + self.tokenInfo.access_token
        }
    };
    try {
        var resp = request('GET', reqUrl, opt);
        var body = resp.getBody('UTF-8');
        self.flows = JSON.parse(body);
        return self.flows;
    }
    catch (e) {
        var logError = {errorId: 205002, errorMsg: e};
        logger.error(205002, e);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
}

/**
 * Exchange credentials for access token
 * */
function authToken(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.authToken);
    var payload = message.payload;
    var username = payload.userName;
    var password = payload.password;
    var url = "http://" + self.host + ":" + self.port + "/auth/token";
    var msgBody = {
        client_id: "node-red-admin",
        grant_type: "password",
        scope: "*",
        username: username,
        password: password
    };
    var opt = {
        body: JSON.stringify(msgBody),
        headers: {
            //"Authorization": "Bearer [token]",
            "Content-Type": "application/json"
        }
    };

    try {
        var resp = request('POST', url, opt);
        var body = resp.getBody('UTF-8');
        self.tokenInfo = JSON.parse(body);
        return self.tokenInfo;
    }
    catch (e) {
        var logError = {errorId: 205001, errorMsg: e};
        logger.error(205001, e);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
}

/*
 * Set the active flow configuration
 * @param {object} self: self reference.
 * @exception {object} Error.
 * */
function setFlowConfigurations(self) {
    var reqUrl = "http://" + self.host + ":" + self.port + "/flows";
    var bodyString = JSON.stringify(self.flows);
    var opt = {
        body: bodyString,
        headers: {
            //"Authorization": self.tokenInfo.token_type + " " + self.tokenInfo.access_token,
            "Content-type": "application/json",
            "Content-Length": bodyString.length,
            "Node-RED-Deployment-Type": "nodes"
        }
    };
    try {
        var resp = request('POST', reqUrl, opt);
        resp.getBody('UTF-8');
    }
    catch (e) {
        logger.info(bodyString);
        logger.error(205003, e);
        var error = new Error(logger.getErrorInfo(205003));
        error.code = logError.errorId;
        throw error;
    }
}

/*
 * Get a list of the installed nodes
 * @param {object} self: self reference.
 * @return [object] nodes: node info array:
 * @exception {object} Error.
 * */
function getInstalledNodes(self) {
    var reqUrl = "http://" + self.host + ":" + self.port + "/nodes";
    var opt = {
        body: JSON.stringify(self.flows),
        headers: {
            //"Authorization": self.tokenInfo.token_type + " " + self.tokenInfo.access_token,
            "Accept": "application/json"
        }
    };
    try {
        var resp = request('GET', reqUrl, opt);
        return JSON.parse(resp.getBody('UTF-8'));
    }
    catch (e) {
        var logError = {errorId: 205004, errorMsg: e};
        logger.error(205004, e);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
}

/*
 * get all timers of the user
 * */
function getAllTimer(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.getAllTimer);
    var userId = message.userUuid;
    var sheetId = getUserSheet(self,  {userUuid: userId}).id;
    var timers = [];
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "inject"
            && self.flows[i].z === sheetId) {
            var timer = self.flows[i];
            timers.push(timer);
        }
    }
    return timers;
}

/*
 * get user sheet by user UUID
 * */
function getUserSheet(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.getUserSheet);
    var userId = message.userUuid;
    var sheetInfo = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "tab" && self.flows[i].label === userId) {
            sheetInfo = self.flows[i];
            break;
        }
    }
    if (!sheetInfo) {
        var logError = {errorId: 205006, errorMsg: " user id =" + userId};
        logger.error(205006, logError);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
    return sheetInfo;
}

/*
 * get node module by id
 * */
function getNodeModule(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.getNodeModule);
    var moduleId = message.moduleId;
    var module = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].id === moduleId) {
            module = self.flows[i];
            break;
        }
    }
    if (!module) {
        var logError = {errorId: 205007, errorMsg: " moduleId = :" + moduleId};
        logger.error(205007, " moduleId = :" + moduleId);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
    return module;
};

/*
 * get flow switch in user sheet by user UUID
 * */
function getFlowSwitch(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.getFlowSwitch);
    var userId = message.userUuid;
    var sheetId = getUserSheet(self, {userUuid: userId}).id;
    var flowSwitch = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "switch"
            && self.flows[i].name === "flowSwitch"
            && self.flows[i].z === sheetId) {
            flowSwitch = self.flows[i];
            break;
        }
    }
    if (!flowSwitch) {
        var logError = {errorId: 205009, errorMsg: getErrorInfo(205009)};
        logger.error(205009);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
    return flowSwitch;
}

/*
 * get flow map in user sheet by user UUID
 * */
function getFlowMap(self, message) {
    var userId = message.userUuid;
    var sheetId = getUserSheet(self,  {userUuid: userId}).id;
    var flowMap = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "comment"
            && self.flows[i].name === "FLOW_MAP"
            && self.flows[i].z === sheetId) {
            flowMap = self.flows[i];
            break;
        }
    }
    //如果改用户的FLOW_MAP不存在，那么构造一个新的MAP
    if (!flowMap) {
        var flowSwitch = getFlowSwitch(self, {userUuid: userUuid});
        flowMap = jsonClone(meshbluTemplate.flowMap);
        flowMap.id = getId();
        flowMap.x = 3 * DISTANCE_X;
        flowMap.y = DISTANCE_Y;
        flowMap.z = sheetId;
        var flowMapInfo = [];
        for (var j = 0; j < flowSwitch.rules.length; j++) {
            flowMapInfo.push({flow: flowSwitch.rules[j].v});
        }
        flowMap.info = JSON.stringify(flowMapInfo);
        self.flows.push(flowMap);
    }
    return flowMap;
}

/*
 * delete node module
 * */
function deleteNodeModule(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.deleteNodeModule);
    var flag = message.flag;
    var moduleId = message.moduleId;
    var nodeModule = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].id === moduleId) {
            nodeModule = self.flows.splice(i, 1)[0];
            if (flag && nodeModule.wires && nodeModule.wires.length > 0) {
                var childNodes = nodeModule.wires;
                for (var j = 0, len1 = childNodes.length; j < len1; j++) {
                    for (var k = 0, len2 = childNodes[j].length; k < len2; ++k) {
                        deleteNodeModule(self, {
                            moduleId: childNodes[j][k],
                            flag: flag
                        });
                    }
                }
            }
            break;
        }
    }
    return nodeModule;
}

/*
 * get id split in user sheet by user UUID
 * */
function getFlowIdSplitter(self, message) {
    //validateMessage(message, OPERATION_SCHEMAS.getFlowIdSplitter);
    var userId = message.userUuid;
    var sheetId = getUserSheet(self, {userUuid: userId}).id;
    var IdSplitter = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "function"
            && self.flows[i].name === "idSplitter"
            && self.flows[i].z === sheetId) {
            IdSplitter = self.flows[i];
            break;
        }
    }
    if (!IdSplitter) {
        var logError = {errorId: 205010, errorMsg: getErrorInfo(205010)};
        logger.error(205010);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
    return IdSplitter;
}

/*
 * get meshbluIn in user sheet by user UUID
 @param {object} message:{
 payload:{
 userUuid:{string},
 }
 }
 @return {object} meshbluIn: node module with the type of meshblu in
 @exception {object} Error.
 * */
function getMeshbluIn(self, message) {
    var userId = message.userUuid;
    var sheetId = getUserSheet(self,  {userUuid: userId}).id;
    var meshbluIn = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "meshblu in"
            && self.flows[i].name === "meshbluIn"
            && self.flows[i].z === sheetId) {
            meshbluIn = self.flows[i];
            break;
        }
    }
    if (!meshbluIn) {
        var logError = {errorId: 205013, errorMsg: "user uuid:" + userId};
        logger.error(205013, ". user uuid:" + userId);
        var error = new Error(logError.errorMsg);
        error.code = logError.errorId;
        throw error;
    }
    return meshbluIn;
}

/*
 * reset module axis Y
 * */
function resetAxisY(self, message) {
    var flag = message.flag;
    var moduleId = message.moduleId;
    var axisY = message.axis_y;
    var nodeModule = null;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].id === moduleId) {
            nodeModule = self.flows[i];
            nodeModule.y = axisY;
            if (flag && nodeModule.wires && nodeModule.wires.length > 0) {
                var childNodes = nodeModule.wires;
                for (var j = 0, len1 = childNodes.length; j < len1; j++) {
                    for (var k = 0, len2 = childNodes[j].length; k < len2; k++) {
                        resetAxisY(self, {moduleId: childNodes[j][k], axis_y: axisY, flag: flag});
                    }
                }
            }
            break;
        }
    }
    return nodeModule;
}

/*
 * format flows
 * */
function formatFlows(self, message) {
    var userUuid = message.userUuid;
    var meshbluIn = getMeshbluIn(self, {userUuid: userUuid});
    var flowSwitch = getFlowSwitch(self, {userUuid: userUuid});
    var timers = getAllTimer(self, {userUuid: userUuid});
    var childFlowIndex = 0;
    //format sub flows
    for (var index1 = 0, len0 = flowSwitch.wires.length; index1 < len0; ++index1) {
        for (var j = 0, len1 = flowSwitch.wires[index1].length; j < len1; ++j, ++childFlowIndex) {
            var childId = flowSwitch.wires[index1][j];
            var axisY = flowSwitch.y + childFlowIndex * DISTANCE_Y;
            resetAxisY(self, {moduleId: childId, axis_y: axisY, flag: true});
        }
    }
    //format timers
    for (var index2 = 0, len2 = timers.length; index2 < len2; ++index2) {
        var axisY1 = meshbluIn.y + (index2 + 1) * DISTANCE_Y;
        resetAxisY(self, {moduleId: timers[index2].id, axis_y: axisY1, flag: false});
    }
}

function FlowManager(conx, uuid, token, configurator) {
    this.tokenInfo = null;
    this.flows = null;
    this.host = self.configurator.getConf("nodered_server.host");
    this.port = self.configurator.getConf("nodered_server.port");
    this.user = self.configurator.getConf("nodered_server.user");
    this.password = self.configurator.getConf("nodered_server.password");
    VirtualDevice.call(this, conx, uuid, token, configurator);
}
util.inherits(FlowManager, VirtualDevice);

/* cmdCode:0001
 * Install a new node module
 * @param {object} message:
 * {
 *   payload:{
 *       module:{string} module name
 *   }
 * }.
 * @param {object} self: self reference.
 * @return {object} nodeInfo: information of the node
 * @exception {object} Error.
 * */
FlowManager.prototype.installNode = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.installNode, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            var module = {module: message.module};
            var reqUrl = "http://" + self.host + ":" + self.port + "/nodes";
            var opt = {
                body: JSON.stringify(module),
                headers: {
                    //"Authorization": self.tokenInfo.token_type + " " + self.tokenInfo.access_token,
                    "Content-type": "application/json"
                }
            };
            try {
                var resp = request('POST', reqUrl, opt);
                responseMessage.data = resp.getBody('UTF-8');
            }
            catch (e) {
                responseMessage.retCode = 205005;
                responseMessage.description = JSON.stringify(e);
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};

/* cmdCode:0002
 * delete user flow
 @param {object} message:{
 payload:{
 userUuid:{string},
 flowId:{string}
 }
 }
 @return {string flow id: the id of the deleted flow.
 @exception {object} Error.
 * */
//FlowManager.prototype.deleteFlow = function (message, self, callback) {
//    if (!self) {
//        self = this;
//    }
//    var responseMessage = {retCode: 200, description: "Success.", data: {}};
//    validateMessage(message, OPERATION_SCHEMAS.deleteFlow, function (error, result) {
//        if (error) {
//            responseMessage.retCode = error.errorId;
//            responseMessage.description = error.errorMsg;
//        }
//        else {
//            try {
//                var payload = message.payload;
//                var userUuid = payload.userUuid;
//                var flowId = payload.flowId;
//                var allTimes = getAllTimer(self, {userUuid: userUuid});
//                var found = false;
//                for (var i = 0, len = allTimes.length; i < len; ++i) {
//                    var timer = allTimes[i];
//                    try {
//                        var flowIds = JSON.parse(timer.payload);
//                        for (var j = 0, len1 = flowIds.length; j < len1; ++j) {
//                            if (flowIds[j].indexOf(flowId) !== -1) {
//                                found = true;
//                                flowIds[j] = flowId + "_DELETED";
//                                break;
//                            }
//                        }
//                        if (found) {
//                            timer.payload = JSON.stringify(flowIds);
//                            timer.name += "[DELETED]";
//                            timer.repeat = "";
//                            timer.crontab = "";
//                            timer.once = true;
//                            break;
//                        }
//                    }
//                    catch (e) {
//                        logger.error(200000, e);
//                    }
//                }
//                if (!found) {
//                    responseMessage.retCode = 205008;
//                    responseMessage.description = ". Can not find flow by id:" + flowId;
//                    logger.error(responseMessage.retCode, responseMessage.description);
//                }
//                else {
//                    responseMessage.data = result;
//                    setFlowConfigurations(self); //update flows
//                }
//            }
//            catch (error) {
//                responseMessage.retCode = error.code;
//                responseMessage.description = error.message;
//            }
//        }
//        if (callback && lodash.isFunction(callback)) {
//            callback(responseMessage);
//        }
//    });
//};

FlowManager.prototype.deleteFlow = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.deleteFlow, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var userUuid = message.userUuid;
                var flowId = message.flowId;
                var flowSwitch = getFlowSwitch(self, {userUuid: userUuid});
                var flowMapModule = getFlowMap(self, {userUuid: userUuid});
                var flowMap = JSON.parse(flowMapModule.info);
                var timers = getAllTimer(self, {userUuid: userUuid});
                var flowIndex = 0;
                var found = false;
                for (var len = flowSwitch.rules.length; flowIndex < len; flowIndex++) {
                    if (flowSwitch.rules[flowIndex].v
                        && (flowSwitch.rules[flowIndex].v === flowId || flowSwitch.rules[flowIndex].v === flowId + "_disabled")) {
                        found = true;
                        break;
                    }
                }
                logger.debug("flowIndex = " + flowIndex);
                if (!found) {
                    responseMessage.retCode = 205008;
                    responseMessage.description = "Can not find flow by id=:" + flowId;
                }
                else {
                    //delete flow id from all timer
                    for (var index = 0, len1 = timers.length; index < len1; index++) {
                        var timer = timers[index];
                        var flowIds = JSON.parse(timer.payload);
                        var j = 0;
                        for (var len2 = flowIds.length; j < len2; j++) {
                            if (flowIds[j].indexOf(flowId) !== -1) {
                                flowIds.splice(j, 1);
                                if (flowIds.length === 0 && timer.topic !== "default_timer") {
                                    deleteNodeModule(self, {moduleId: timer.id, flag: false});
                                }
                                else {
                                    timer.payload = JSON.stringify(flowIds);
                                }
                                break;
                            }
                        }
                        if (j !== flowIds.length) {
                            break;
                        }
                    }
                    //delete node module witch included in the flow
                    var flowWires = flowSwitch.wires[flowIndex];
                    for (var index1 = 0, len3 = flowWires.length; index1 < len3; index1++) {
                        var nextNodeId = flowWires[index1];
                        deleteNodeModule(self, {moduleId: nextNodeId, flag: true});
                    }
                    //delete flow switch
                    flowSwitch.rules.splice(flowIndex, 1);
                    flowSwitch.wires.splice(flowIndex, 1);
                    flowSwitch.outputs -= 1;
                    //deletw flow id form FLOW_MAP
                    for (var k = 0; k < flowMap.length; k++) {
                        if (flowMap[k].flow === flowId) {
                            flowMap[k].flow = null;
                            break;
                        }
                    }
                    flowMapModule.info = JSON.stringify(flowMap);
                    //update flows setting
                    setFlowConfigurations(self);
                    responseMessage.data = flowId;
                }
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};

/* cmdCode:0003
 * delete user sheet by user UUID
 * */
FlowManager.prototype.deleteUserSheet = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.deleteUserSheet, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var sheet = getUserSheet(self, message);
                var tempFlows = [];
                for (var i = 0, len = self.flows.length; i < len; i++) {
                    if (self.flows[i].id === sheet.id) {

                    }
                    else if (self.flows[i].z && self.flows[i].z === sheet.id) {

                    }
                    else {
                        tempFlows.push(self.flows[i]);
                    }
                }
                self.flows = tempFlows;
                setFlowConfigurations(self);//update flows
                responseMessage.data = sheet.id;
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};


/* cmdCode:0004
 * get action flow detail info
 * */
FlowManager.prototype.getMyFlows = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.getMyFlows, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var flowIds = [];
                var userId = message.userUuid;
                var flowSwitch = getFlowSwitch(self,  {userUuid: userId});
                for (var flowIndex = 0, len = flowSwitch.rules.length; flowIndex < len; flowIndex++) {
                    flowIds.push(flowSwitch.rules[flowIndex].v);
                }
                responseMessage.data = flowIds;
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};

/* cmdCode:0005
 * get action flow detail info
 * */
FlowManager.prototype.getFlowDetail = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.getFlowDetail, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var userId = message.userUuid;
                var flowId = message.flowId;
                var flowSwitch = getFlowSwitch(self,  {userUuid: userId});
                var flowIndex = 0;
                var found = false;
                for (var len = flowSwitch.rules.length; flowIndex < len; flowIndex++) {
                    if (flowSwitch.rules[flowIndex].v && flowSwitch.rules[flowIndex].v === flowId) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    responseMessage.retCode = 205008;
                    responseMessage.description = ". Can not find flow by id:" + flowId;
                    logger.error(responseMessage.retCode, responseMessage.description);
                }
                else {
                    var collectFuncId = flowSwitch.wires[flowIndex][0];
                    var collectFunc = getNodeModule(self, {moduleId: collectFuncId});
                    var meshbluOutId = collectFunc.wires[0][0];
                    var meshbluOut = getNodeModule(self,  {moduleId: meshbluOutId});
                    var collectFuncStr = collectFunc.func;
                    var beginStr = "var newMsg = ";
                    var begin = collectFuncStr.indexOf(beginStr) + beginStr.length;
                    var end = collectFuncStr.indexOf(";");
                    var collectMsgStr = collectFuncStr.substr(begin, end - begin);
                    var collectMsg = JSON.parse(collectMsgStr);
                    var retMsg = {
                        userUuid: meshbluOut.uuid,
                        attrs: collectMsg.payload.parameters,
                        timer: {
                            id: "",
                            name: "",
                            interval: 0,
                            between: [],
                            weekday: []
                        }
                    };
                    var userTimers = getAllTimer(self, {userUuid: userId});
                    //get timer of the flow
                    for (var i = 0; i < userTimers.length; i++) {
                        var timer = userTimers[i];
                        var flowIds = JSON.parse(timer.payload);
                        if (flowIds.length === 0) {
                            continue;
                        }
                        var j = 0;
                        for (var len1 = flowIds.length; j < len1; j++) {
                            if (flowIds[j].indexOf(flowId) !== -1) {
                                retMsg.timer.id = timer.id;
                                retMsg.timer.name = timer.name;
                                if (timer.repeat != "") {
                                    retMsg.timer.interval = parseInt(timer.repeat);
                                }
                                else {
                                    //"crontab": "*/5 0-13 * * 1,4,5,0",
                                    if (timer.crontab[0] === "*") {
                                        var crontabArray1 = timer.crontab.split(" ");
                                        retMsg.timer.interval = parseInt(crontabArray1[0].substr(2).trim()) * 60;
                                        var timeArray = crontabArray1[1].split("-");
                                        if (parseInt(timeArray[0], 10) < 10) {
                                            retMsg.timer.between.push("0" + timeArray[0].toString() + ":00");
                                        }
                                        else {
                                            retMsg.timer.between.push(timeArray[0].toString() + ":00");
                                        }
                                        retMsg.timer.between.push(timeArray[1].toString() + ":00");
                                        retMsg.timer.weekday = crontabArray1[4].split(",");
                                    }
                                    else {
                                        //"crontab": "04 09 * * 1,3,4,6,0",
                                        var crontabArray2 = timer.crontab.split(" ");
                                        retMsg.timer.interval = 0;
                                        retMsg.timer.between.push(crontabArray2[1] + ":" + crontabArray2[0]);
                                        retMsg.timer.between.push(crontabArray2[1] + ":" + crontabArray2[0]);
                                        retMsg.timer.weekday = crontabArray2[4].split(",");
                                    }
                                }
                                break;
                            }
                        }
                        if (j != flowIds.length) {
                            break;
                        }
                    }
                    responseMessage.data = retMsg;
                }
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};

/* cmdCode:0006
 * create a action flow for device
 * */
FlowManager.prototype.addFlow = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.addFlow, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var payload = message;
                var userId = payload.userUuid;
                var flow = payload.flow;
                var flowMode = payload.mode;
                var flowId = getId();
                var timer = null;
                var sheetId = getUserSheet(self, {userUuid: userId}).id;
                var flowSwitch = getFlowSwitch(self, {userUuid: userId});
                var flowMapModule = getFlowMap(self, {userUuid: userId});
                var flowMap = JSON.parse(flowMapModule.info);
                var flowIndex = 0;
                for (; flowIndex < flowMap.length; flowIndex++) {
                    if (!flowMap[flowIndex].flow || flowMap[flowIndex].flow === "") {
                        flowMap[flowIndex].flow = flowId;
                        break;
                    }
                }
                if (flowIndex === flowMap.length) {
                    flowMap.push({flow: flowId});
                }
                logger.debug("flowIndex=" + flowIndex);
                flowMapModule.info = JSON.stringify(flowMap);
                var userTimers = getAllTimer(self, {userUuid: userId});
                var timerCount = userTimers.length;
                if (payload.timerId) {
                    var found = false;
                    for (var i = 0; i < timerCount; i++) {
                        if (userTimers[i].id === payload.timerId) {
                            found = true;
                            timer = userTimers[i];
                            break;
                        }
                    }
                    if (!found) {
                        logger.error(205011, ". timer id:" + payload.timerId);
                        var error = new Error("timer id:" + payload.timerId);
                        error.code = 205011;
                        throw error;
                    }
                    var timerFlowIds = JSON.parse(timer.payload);
                    if (payload.enable === true) {
                        timerFlowIds.push(flowId);
                    }
                    else {
                        if (-1 === flowId.search(/_disabled/)) {
                            timerFlowIds.push(flowId + "_disabled");
                        }
                        else {
                            timerFlowIds.push(flowId);
                        }
                    }
                    timer.payload = JSON.stringify(timerFlowIds);
                }
                else {
                    if (payload.newTimer) {
                        var idSplitter = getFlowIdSplitter(self,  {userUuid: userId});
                        var timerConf = message.newTimer;
                        timer = jsonClone(timerTemplate.intervalTimer);
                        timer.id = getId();
                        timer.name = flowIndex + "_" + timerConf.name;
                        timer.topic = "user-defined";
                        timer.repeat = timerConf.interval;
                        timer.x = DISTANCE_X;
                        timer.y = (flowIndex + 1) * DISTANCE_Y;
                        timer.z = sheetId;
                        timer.wires.push([idSplitter.id]);
                        if (timerConf.between && timerConf.weekday) {
                            timer.repeat = "";
                            if (timerConf.interval > 0) {
                                if (timerConf.interval < 60 || timerConf.interval > 3600) {
                                    var logError = {
                                        errorId: 205014,
                                        errorMsg: "current value=:" + timerConf.interval
                                    };
                                    logger.error(205014, ". current value=:" + timerConf.interval);
                                    var error = new Error(logError.errorMsg);
                                    error.code = logError.errorId;
                                    throw error;
                                }
                                //"crontab": "*/5 0-13 * * 1,4,5,0",
                                timer.crontab = "*/" + timerConf.interval / 60;
                                var beginTime1 = timerConf.between[0];
                                var endTime = timerConf.between[1];
                                var beginTimeArray1 = beginTime1.split(':');
                                var endTimeArray1 = endTime.split(':');
                                timer.crontab += " "
                                + parseInt(beginTimeArray1[0], 10)
                                + "-"
                                + parseInt(endTimeArray1[0], 10)
                                + " * * ";
                                for (var i = 0, len1 = timerConf.weekday.length; i < len1; i++) {
                                    if (i === 0) {
                                        timer.crontab += timerConf.weekday[i];
                                    }
                                    else {
                                        timer.crontab += "," + timerConf.weekday[i];
                                    }
                                }
                            }
                            else if (timerConf.interval === 0) {
                                //"crontab": "04 09 * * 1,3,4,6,0",
                                var dayOffset = 0;
                                var beginTime = timerConf.between[0];
                                var beginTimeArray = beginTime.split(':');
                                var oneMinMS = 60 * 1000;
                                var oneHourMS = 60 * oneMinMS;
                                var oneDayMS = 24 * oneHourMS;
                                var timeMS = parseInt(beginTimeArray[0], 10) * oneHourMS + parseInt(beginTimeArray[1], 10) * oneMinMS;
                                if (payload.timeZoneOffset) {
                                    timeMS -= payload.timeZoneOffset;
                                }
                                if (timeMS >= oneDayMS) {
                                    dayOffset = Math.floor(timeMS / oneDayMS);
                                    timeMS = timeMS % oneDayMS;
                                }
                                if (timeMS < 0) {
                                    dayOffset = Math.floor(timeMS / oneDayMS);
                                    timeMS = timeMS % oneDayMS + oneDayMS;
                                }

                                timer.crontab += Math.floor((timeMS % oneHourMS) / oneMinMS)
                                + " "
                                + Math.floor(timeMS / oneHourMS)
                                + " * * ";
                                if (timerConf.weekday.length == 7) {
                                    timer.crontab += "*"
                                }
                                else {
                                    for (var index1 = 0, len2 = timerConf.weekday.length; index1 < len2; index1++) {
                                        var value = parseInt(timerConf.weekday[index1]) + dayOffset;
                                        value = value >= 7 ? value - 7 : value < 0 ? value + 7 : value;
                                        if (index1 === 0) {
                                            timer.crontab += value;
                                        }
                                        else {
                                            timer.crontab += "," + value;
                                        }
                                    }
                                }
                            }
                        }
                        var flowIds = JSON.parse(timer.payload);
                        if (payload.enable === true) {
                            flowIds.push(flowId);
                        }
                        else {
                            if (-1 === flowId.search(/_disabled/)) {
                                flowIds.push(flowId + "_disabled");
                            }
                            else {
                                flowIds.push(flowId);
                            }
                        }
                        timer.payload = JSON.stringify(flowIds);
                        self.flows.push(timer);
                    }
                }
                var funcCondition = "true";
                if (flowMode === "SERIES" || flowMode === "WATERFALL") {
                    funcCondition = "msg.payload && msg.payload.code === 200";
                }
                var preNode = null;
                for (var index = 0, length = flow.length; index < length; index++) {
                    var deviceUuid = flow[index].deviceUuid;
                    var parameters = flow[index].parameters;
                    var methodName = flow[index].method;
                    if (index == 0) {
                        var actionFunc = jsonClone(functionTemplate.actionFunc);
                        actionFunc.name = flowIndex + "_" + actionFunc.name;
                        actionFunc.id = getId();
                        actionFunc.func = actionFunc.func.replace(/<condition>/i, "msg.flowId");
                        actionFunc.func = actionFunc.func.replace(/<method>/i, methodName);
                        actionFunc.func = actionFunc.func.replace(/<parameters>/i, JSON.stringify(parameters));
                        actionFunc.x = flowSwitch.x + DISTANCE_X;
                        actionFunc.y = (flowIndex + 1) * DISTANCE_Y;
                        actionFunc.z = sheetId;
                        self.flows.push(actionFunc);
                        var meshbluOut = jsonClone(meshbluTemplate.meshbluOut);
                        meshbluOut.id = getId();
                        meshbluOut.name = flowIndex + "_" + meshbluOut.name;
                        actionFunc.wires.push([meshbluOut.id]);//
                        meshbluOut.uuid = deviceUuid;
                        meshbluOut.forwards = true;
                        //meshbluOut.outputs = 1;
                        meshbluOut.server = meshbluTemplate.meshbluServer.id;
                        meshbluOut.x = actionFunc.x + DISTANCE_X;
                        meshbluOut.y = actionFunc.y;
                        meshbluOut.z = sheetId;
                        preNode = meshbluOut;
                        self.flows.push(meshbluOut);
                        flowSwitch.outputs += 1;

                        flowSwitch.rules.splice(flowIndex, 0, {t: "eq", v: flowId});
                        flowSwitch.wires.splice(flowIndex, 0, [actionFunc.id]);
                    }
                    else {
                        var actionFunc1 = jsonClone(functionTemplate.actionFunc);
                        actionFunc1.name = flowIndex + "_" + actionFunc1.name;
                        actionFunc1.id = getId();
                        if (flowMode === "PARALLEL") {
                            actionFunc1.func = actionFunc1.func.replace(/<condition>/i, "msg.flowId");
                        }
                        else {
                            actionFunc1.func = actionFunc1.func.replace(/<condition>/i, funcCondition);
                        }
                        actionFunc1.func = actionFunc1.func.replace(/<cmdName>/i, methodName);
                        if (flowMode === "WATERFALL") {
                            var paramString = JSON.stringify(parameters);
                            for (var p in parameters) {
                                if (typeof(parameters[p]) === "string" && parameters[p][0] === '&') {
                                    var subString = parameters[p].substring(1);
                                    var pattern = "\"" + parameters[p] + "\"";
                                    paramString = paramString.replace(pattern, subString);
                                }
                            }
                            actionFunc1.func = "var payload = msg.payload; \n" + actionFunc1.func.replace(/<parameters>/i, paramString);
                        }
                        else {
                            actionFunc1.func = actionFunc1.func.replace(/<parameters>/i, JSON.stringify(parameters));
                        }
                        actionFunc1.x = preNode.x + DISTANCE_X;
                        actionFunc1.y = preNode.y;
                        actionFunc1.z = sheetId;
                        if (flowMode === "PARALLEL") {
                            var wiresLength = flowSwitch.wires.length;
                            flowSwitch.wires[wiresLength - 1].push(actionFunc1.id);
                        }
                        else {
                            preNode.outputs = 1;
                            preNode.wires.push([actionFunc1.id]);
                        }
                        self.flows.push(actionFunc1);
                        var meshbluOut1 = jsonClone(meshbluTemplate.meshbluOut);
                        meshbluOut1.id = getId();
                        meshbluOut1.name = flowIndex + "_" + meshbluOut1.name;
                        actionFunc1.wires.push([meshbluOut1.id]);//
                        meshbluOut1.uuid = deviceUuid;
                        meshbluOut1.forwards = true;
                        //meshbluOut.outputs = 1;
                        meshbluOut1.server = meshbluTemplate.meshbluServer.id;
                        meshbluOut1.x = actionFunc1.x + DISTANCE_X;
                        meshbluOut1.y = actionFunc1.y;
                        meshbluOut1.z = sheetId;
                        preNode = meshbluOut1;
                        self.flows.push(meshbluOut1);
                    }
                }
                setFlowConfigurations(self); //update flows
                responseMessage.data = flowId;
            }
            catch (error) {
                logger.error(error.code, error.message);
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};


/*
 * init the node-red virtual device
 * */
FlowManager.prototype.init = function () {
    var self = this;
    getFlowConfigurations(self);
    var found = false;
    for (var i = 0, len = self.flows.length; i < len; i++) {
        if (self.flows[i].type === "meshbluServer") {
            found = true;
            logger.debug(self.flows[i]);
            meshbluTemplate.meshbluServer = jsonClone(self.flows[i]);
            fs.writeFileSync(path.join(__dirname, 'meshblu-template.json'), JSON.stringify(meshbluTemplate));
            break;
        }
    }
    if (!found) {
        meshbluTemplate.meshbluServer.id = getId();
        self.flows.unshift(meshbluTemplate.meshbluServer);
        setFlowConfigurations(self);
    }
    self.isInitCompleted = true;
};

/** cmdCode:0007
 * add user sheet
 * */
FlowManager.prototype.addSheet = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.addSheet, function (error) {
        if (error) {
            responseMessage= error;
        }
        else {
            try {
                //add user sheet
                var payload = message.payload;
                var sheet = {"type": "tab", "id": getId(), "label": payload.userUuid};
                self.flows.unshift(sheet);
                // add default flow switch
                var flowSwitch = jsonClone(switchTemplate.flowSwitch);
                flowSwitch.id = getId();
                flowSwitch.x = 3 * DISTANCE_X;
                flowSwitch.y = 8 * DISTANCE_Y;
                flowSwitch.z = sheet.id;
                self.flows.push(flowSwitch);
                //add defalut meshblu in
                var meshbluIn = jsonClone(meshbluTemplate.meshbluIn);
                meshbluIn.id = getId();
                meshbluIn.server = meshbluTemplate.meshbluServer.id;
                meshbluIn.x = 2 * DISTANCE_X;
                meshbluIn.y = DISTANCE_Y;
                meshbluIn.z = sheet.id;
                meshbluIn.wires.push([flowSwitch.id]);//connect to flowSwitch
                self.flows.push(meshbluIn);
                //add flow map
                var flowMap = jsonClone(meshbluTemplate.flowMap);
                flowMap.id = getId();
                flowMap.x = 3 * DISTANCE_X;
                flowMap.y = DISTANCE_Y;
                flowMap.z = sheet.id;
                self.flows.push(flowMap);
                //add timer function
                var timerFunc = jsonClone(timerTemplate.timerFunc);
                timerFunc.id = getId();
                timerFunc.x = 2 * DISTANCE_X;
                timerFunc.y = 8 * DISTANCE_Y;
                timerFunc.z = sheet.id;
                timerFunc.wires.push([flowSwitch.id]);//connect to flowSwitch
                self.flows.push(timerFunc);
                ////add default timer(5,30,60)
                //var timer5Min = jsonClone(temerTemplate.intervalTimer);
                //timer5Min.id = getId();
                //timer5Min.name = "5 min";
                //timer5Min.repeat = "300";
                //timer5Min.x = DISTANCE_X;
                //timer5Min.y = 2 * DISTANCE_Y;
                //timer5Min.z = sheet.id;
                //timer5Min.wires.push([timerFunc.id]);//connect to timerFunc
                //self.flows.push(timer5Min);
                //var timer30Min = jsonClone(temerTemplate.intervalTimer);
                //timer30Min.id = getId();
                //timer30Min.name = "30 min";
                //timer30Min.repeat = "1800";
                //timer30Min.x = DISTANCE_X;
                //timer30Min.y = 3 * DISTANCE_Y;
                //timer30Min.z = sheet.id;
                //timer30Min.wires.push([timerFunc.id]);//connect to timerFunc
                //self.flows.push(timer30Min);
                //var timer60Min = jsonClone(temerTemplate.intervalTimer);
                //timer60Min.id = getId();
                //timer60Min.name = "60 min";
                //timer60Min.repeat = "3600";
                //timer60Min.x = DISTANCE_X;
                //timer60Min.y = 4 * DISTANCE_Y;
                //timer60Min.z = sheet.id;
                //timer60Min.wires.push([timerFunc.id]);//connect to timerFunc
                //self.flows.push(timer60Min);
                setFlowConfigurations(self);//update flows
                responseMessage.data = sheet.id;
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};

// cmdCode:0008
FlowManager.prototype.executeFlow = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.executeFlow, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var payload = message.payload;
                var userUuid = payload.userUuid;
                var flowId = payload.flowId;
                var flowSwitch = getFlowSwitch(self, {userUuid: userUuid});
                var found = false;
                for (var i = 0, len = flowSwitch.rules.length; i < len; ++i) {
                    var rule = flowSwitch.rules[i];
                    if (rule.v === flowId) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    responseMessage.retCode = 205008;
                    responseMessage.description = ". Can not find flow by id:" + flowId;
                    logger.error(responseMessage.retCode, responseMessage.description);
                }
                self.message({devices: meshbluTemplate.meshbluServer.uuid, flowId: payload.flowId});
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};
// cmdCode:0009
FlowManager.prototype.disableFlow = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.disableFlow, function (error) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var payload = message.payload;
                var userUuid = payload.userUuid;
                var flowId = payload.flowId;
                var allTimes = getAllTimer(self, {userUuid: userUuid});
                var found = false;
                for (var i = 0, len = allTimes.length; i < len; ++i) {
                    var timer = allTimes[i];
                    try {
                        var flowIds = JSON.parse(timer.payload);
                        for (var j = 0, len1 = flowIds.length; j < len1; ++j) {
                            if (flowIds[j].indexOf(flowId) !== -1) {
                                found = true;
                                if (-1 === flowId.search(/_disabled/)) {
                                    flowIds[j] = flowId + "_disabled";
                                }
                                else {
                                    flowIds[j] = flowId;
                                }
                                break;
                            }
                        }
                        if (found) {
                            timer.payload = JSON.stringify(flowIds);
                            if (-1 === timer.name.search(/_disabled/)) {
                                timer.name += "_disabled";
                            }
                            break;
                        }
                    }
                    catch (e) {
                        logger.error(200000, e);
                    }
                }
                if (!found) {
                    responseMessage.retCode = 205008;
                    responseMessage.description = ". Can not find flow by id:" + flowId;
                    logger.error(responseMessage.retCode, responseMessage.description);
                }
                else {
                    responseMessage.data = result;
                    setFlowConfigurations(self); //update flows
                }
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};
// cmdCode:0010
FlowManager.prototype.enableFlow = function (message, callback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.enableFlow, function (error, result) {
        if (error) {
            responseMessage = error;
        }
        else {
            try {
                var payload = message.payload;
                var userUuid = payload.userUuid;
                var flowId = payload.flowId;
                var allTimes = getAllTimer(self, {userUuid: userUuid});
                var found = false;
                for (var i = 0, len = allTimes.length; i < len; ++i) {
                    var timer = allTimes[i];
                    try {
                        var flowIds = JSON.parse(timer.payload);
                        for (var j = 0, len1 = flowIds.length; j < len1; ++j) {
                            if (flowIds[j].indexOf(flowId) !== -1) {
                                found = true;
                                flowIds[j] = flowId;
                                break;
                            }
                        }
                        if (found) {
                            timer.payload = JSON.stringify(flowIds);
                            timer.name = timer.name.replace(/_disabled/g, "");
                            break;
                        }
                    }
                    catch (e) {
                        logger.error(200000, e);
                    }
                }
                if (!found) {
                    responseMessage.retCode = 205008;
                    responseMessage.description = ". Can not find flow by id:" + flowId;
                    logger.error(responseMessage.retCode, responseMessage.description);
                }
                else {
                    responseMessage.data = result;
                    setFlowConfigurations(self); //update flows
                }
            }
            catch (error) {
                responseMessage.retCode = error.code;
                responseMessage.description = error.message;
            }
        }
        if (callback && _.isFunction(callback)) {
            callback(responseMessage);
        }
    });
};

module.exports = {
    Service: FlowManager,
    OperationSchemas: OPERATION_SCHEMAS
};