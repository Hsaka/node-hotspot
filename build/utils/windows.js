'use strict';

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = {
    enable: function enable(opts) {
        var _this = this;

        return new _bluebird2.default(function (resolve, reject) {

            if (opts.force) {
                opts.force = false;
                return _this.disable().then(_this.enable.bind(_this, opts)).catch(reject);
            }

            _this.create(opts.ssid, opts.password).then(function () {
                return new _bluebird2.default(function (resolve, reject) {
                    if (opts.adaptor) {
                        _this.ConnectedAdaptor = opts.adaptor;
                        return resolve();
                    }
                    _this.getInternetConnectedAdaptor().then(function (ConnectedAdaptor) {
                        _this.ConnectedAdaptor = ConnectedAdaptor.InterfaceAlias;
                        resolve();
                    }).catch(reject);
                });
            }).then(function () {
                console.log('Starting hotspot');
                return _this.exec('netsh wlan start hostednetwork');
            }).then(_this.getNetworkAdaptors.bind(_this)).then(function (NetworkAdaptors) {
                console.log('Hotspot started!');
                return _lodash2.default.result(_lodash2.default.find(NetworkAdaptors, function (adaptor) {
                    return adaptor.interface === 'Microsoft Hosted Network Virtual Adapter';
                }), 'name');
            }).then(function (hostedNetwork) {
                console.log('Configuring ICS to share:', _this.ConnectedAdaptor);
                return _this.exec(_util2.default.format('"bin/win32/IcsManager.exe" enable "%s" "%s" true', _this.ConnectedAdaptor, hostedNetwork));
            }).then(function () {
                return console.log('ICS Configuration successful!');
            }).then(resolve).catch(reject);
        });
    },
    disable: function disable(opts) {
        var _this2 = this;

        return new _bluebird2.default(function (resolve, reject) {
            _this2.exec('netsh wlan stop hostednetwork').then(function () {
                return _this2.exec('netsh wlan set hostednetwork mode=disallow');
            }).then(resolve).catch(reject);
        });
    },
    getStatus: function getStatus() {
        var _this3 = this;

        return new _bluebird2.default(function (resolve, reject) {
            _bluebird2.default.all([_this3.exec('netsh wlan show hostednetwork'), _this3.getNetworkAdaptors(), _this3.getInternetConnectedAdaptor()]).spread(function (status, NetworkAdaptors, ConnectedAdaptor) {
                var output = status.split('Hosted network settings')[1].replace('-----------------------', '').split('Hosted network status')[0].split('\n').map(Function.prototype.call, String.prototype.trim).filter(Boolean).concat(status.split('Hosted network status')[1].replace('---------------------', '').split('\n').map(Function.prototype.call, String.prototype.trim).filter(Boolean));

                var statusObject = {};
                output.forEach(function (statusItem) {
                    if (statusItem.split(':')[0].trim() === 'SSID name') var parm = statusItem.split(':')[1].trim().substring(1, statusItem.split(':')[1].trim().length - 1);else var parm = statusItem.split(':').length > 2 ? statusItem.split(':').splice(0, 1).join(':').trim() : statusItem.split(':')[1].trim();
                    statusObject[statusItem.split(':')[0].trim()] = parm;
                });
                statusObject['networkAdaptors'] = NetworkAdaptors;
                statusObject['connectedAdaptor'] = ConnectedAdaptor;
                resolve(statusObject);
            }).catch(reject);
        });
    },
    getNetworkAdaptors: function getNetworkAdaptors() {
        var _this4 = this;

        return new _bluebird2.default(function (resolve, reject) {
            _this4.exec('powershell "Get-NetAdapter | ft Name, Status, ifIndex, MacAddress, InterfaceDescription"').then(function (output) {
                var networkData = output.split('--------------------')[1].split('\n').map(Function.prototype.call, String.prototype.trim).filter(Boolean);

                var networkAdaptors = [];
                networkData.forEach(function (statusItem) {
                    var splitString = statusItem.indexOf('Disconnected') > -1 ? 'Disconnected' : statusItem.indexOf('Not Present') > -1 ? 'Not Present' : 'Up';
                    networkAdaptors.push({
                        interface: statusItem.split(splitString)[1].trim().split(' ').splice(2).map(Function.prototype.call, String.prototype.trim).filter(Boolean).join(' '),
                        mac: statusItem.split(splitString)[1].split(' ').splice(1).map(Function.prototype.call, String.prototype.trim).filter(Boolean)[1],
                        name: statusItem.split(splitString)[0].trim(),
                        status: splitString === 'Up' ? 'Connected' : splitString === 'Not Present' ? 'Disabled' : 'Disconnected',
                        id: statusItem.split(splitString)[1].trim().split(' ')[0]
                    });
                });
                resolve(networkAdaptors);
            }).catch(reject);
        });
    },
    getInternetConnectedAdaptor: function getInternetConnectedAdaptor() {
        var _this5 = this;

        return new _bluebird2.default(function (resolve, reject) {
            _this5.exec('powershell "Get-NetConnectionProfile"').then(function (output) {
                var networkData = output.split('\n').map(Function.prototype.call, String.prototype.trim).filter(Boolean);

                var statusObject = {};
                networkData.forEach(function (statusItem) {
                    statusObject[statusItem.split(':')[0].trim()] = statusItem.split(':')[1].trim();
                });
                _this5.getLocalIp(statusObject.InterfaceIndex).then(function (ip) {
                    statusObject['ip'] = ip;
                    resolve(statusObject);
                });
            }).catch(reject);
        });
    },
    getLocalIp: function getLocalIp(AdapterID) {
        var _this6 = this;

        return new _bluebird2.default(function (resolve) {
            _this6.exec(_util2.default.format('powershell "(Get-NetAdapter -ifIndex "%s" | Get-NetIPAddress).IPv4Address"', AdapterID)).then(function (output) {
                resolve(output.replace('\n', '').replace('\r', ''));
            });
        });
    },
    getClients: function getClients(opts) {
        var _this7 = this;

        return new _bluebird2.default(function (resolve, reject) {
            _this7.getStatus().then(function (statusObject) {
                resolve({
                    connected: statusObject.Status === 'Started' ? parseInt(statusObject['Number of clients']) : 0,
                    max: parseInt(statusObject['Max number of clients'])
                });
            }).catch(reject);
        });
    },
    create: function create(name, key) {
        var _this8 = this;

        console.log('Configuring hotspot with SSID:', name);

        return new _bluebird2.default(function (resolve, reject) {
            _this8.exec('netsh wlan set hostednetwork mode=allow').then(function () {
                return _this8.exec(_util2.default.format('netsh wlan set hostednetwork ssid="%s" key="%s" keyUsage=temporary', name, key));
            }).then(resolve).catch(reject);
        });
    },
    exec: function exec(args) {
        var options = arguments.length <= 1 || arguments[1] === undefined ? {
            env: {}
        } : arguments[1];

        return new _bluebird2.default(function (resolve, reject) {
            options.env = _lodash2.default.defaultsDeep(options.env, process.env);
            _child_process2.default.exec(args, options, function (stderr, stdout, code) {
                if (code) {
                    var cmd = Array.isArray(args) ? args.join(' ') : args;
                    console.log(cmd + ' returned non zero exit code. Stderr: ' + stderr);
                    reject(stderr);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
};