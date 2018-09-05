/// <reference path="../TestFramework/Common.ts" />
/// <reference path="../../JavaScriptSDK/AppInsightsCore.ts" />
/// <reference path="../../applicationinsights-core-js.ts" />

import { IConfiguration, ITelemetryPlugin, ITelemetryItem, IPlugin } from "../../applicationinsights-core-js"
import { AppInsightsCore } from "../../JavaScriptSDK/AppInsightsCore";
import { IChannelControls } from "../../JavaScriptSDK.Interfaces/IChannelControls";

export class ApplicationInsightsCoreTests extends TestClass {

    public testInitialize() {
        super.testInitialize();
    }

    public testCleanup() {
        super.testCleanup();
    }

    public registerTests() {

        this.testCase({
            name: "ApplicationInsightsCore: Initialization validates input",
            test: () => {

                let samplingPlugin = new TestSamplingPlugin();
                                
                let appInsightsCore = new AppInsightsCore();
                try {                    
                    appInsightsCore.initialize(null, [samplingPlugin]);
                } catch (error) {
                    Assert.ok(true, "Validates configuration");                    
                }

                let config2 : IConfiguration = {
                        endpointUrl: "https://dc.services.visualstudio.com/v2/track",
                        instrumentationKey: "40ed4f60-2a2f-4f94-a617-22b20a520864",
                        extensionConfig: {}
                };

                try {                    
                    appInsightsCore.initialize(config2, null);
                } catch (error) {
                    Assert.ok(true, "Validates extensions are provided");                    
                }
                let config : IConfiguration = {
                    endpointUrl: "https://dc.services.visualstudio.com/v2/track",
                    instrumentationKey: "",
                    extensionConfig: {}
                };
                try {                    
                    appInsightsCore.initialize(config, [samplingPlugin]);
                } catch (error) {
                    Assert.ok(true, "Validates instrumentationKey");
                }
            }
        });

        this.testCase({
            name: "ApplicationInsightsCore: Initialization initializes setNextPlugin",
            test: () => {
                let samplingPlugin = new TestSamplingPlugin();
                samplingPlugin.priority = 20;

                let channelPlugin = new ChannelPlugin();
                channelPlugin.priority = 120;
                // Assert prior to initialize
                Assert.ok(!samplingPlugin.nexttPlugin, "Not setup prior to pipeline initialization");

                let appInsightsCore = new AppInsightsCore();
                appInsightsCore.initialize(
                    {instrumentationKey: "09465199-12AA-4124-817F-544738CC7C41"}, 
                    [samplingPlugin, channelPlugin]);
                Assert.ok(!!samplingPlugin.nexttPlugin, "setup prior to pipeline initialization");
            }
        });


        this.testCase({
            name: "ApplicationInsightsCore: Plugins cannot be added with same priority",
            test: () => {
                let samplingPlugin = new TestSamplingPlugin();
                samplingPlugin.priority = 20;

                let samplingPlugin1 = new TestSamplingPlugin();
                samplingPlugin1.priority = 20;

                let channelPlugin = new ChannelPlugin();
                channelPlugin.priority = 120;

                let appInsightsCore = new AppInsightsCore();
                try {
                appInsightsCore.initialize(
                    {instrumentationKey: "09465199-12AA-4124-817F-544738CC7C41"}, 
                    [samplingPlugin, samplingPlugin1, channelPlugin]);
                } catch (error) {
                    Assert.ok(error.message.indexOf("priority") >= 0, "Priority cannot be the same");
                }
            }
        });

        this.testCase({
            name: "ApplicationInsightsCore: flush clears channel buffer",
            test: () => {
                let channelPlugin = new ChannelPlugin();
                let appInsightsCore = new AppInsightsCore();
                appInsightsCore.initialize(
                    {instrumentationKey: "09465199-12AA-4124-817F-544738CC7C41"}, 
                    [channelPlugin]);
                
                Assert.ok(!channelPlugin.isFlushInvoked, "Flush not called on initialize");
                appInsightsCore.getTransmissionControl().flush(true);

                Assert.ok(channelPlugin.isFlushInvoked, "Flush triggered for channel");
            }
        });

        this.testCase({
            name: "ApplicationInsightsCore: Plugins can be provided through configuration",
            test: () => {
                let samplingPlugin = new TestSamplingPlugin();
                samplingPlugin.priority = 20;

                let channelPlugin = new ChannelPlugin();
                channelPlugin.priority = 120;

                let appInsightsCore = new AppInsightsCore();
                try {
                appInsightsCore.initialize(
                    {instrumentationKey: "09465199-12AA-4124-817F-544738CC7C41", extensions: [samplingPlugin]},
                    [channelPlugin]);
                } catch (error) {
                    Assert.ok(false, "No error expected");
                }

                Assert.ok((<any>appInsightsCore)._extensions.length === 2, "Extensions can be provided through overall configuration");
            }
        });

        this.testCase({
            name: "ApplicationInsightsCore: Non telemetry specific plugins are initialized and not part of telemetry processing pipeline",
            test: () => {
                let samplingPlugin = new TestSamplingPlugin();
                samplingPlugin.priority = 20;

                let testPlugin = new TestPlugin();

                let channelPlugin = new ChannelPlugin();
                channelPlugin.priority = 120;

                let appInsightsCore = new AppInsightsCore();
                try {
                appInsightsCore.initialize(
                    {instrumentationKey: "09465199-12AA-4124-817F-544738CC7C41"},
                    [testPlugin, samplingPlugin, channelPlugin]);
                } catch (error) {
                    Assert.ok(false, "Exception not expected");
                }

                Assert.ok(typeof ((<any>appInsightsCore)._extensions[0].processTelemetry) !== 'function', "Extensions can be provided through overall configuration");
            }
        });
    }
}

class TestSamplingPlugin implements ITelemetryPlugin {
    public processTelemetry: (env: ITelemetryItem) => void;
    public initialize: (config: IConfiguration) => void;
    public identifier: string = "AzureSamplingPlugin";
    public setNextPlugin: (next: ITelemetryPlugin) => void;
    public priority: number = 5;
    private samplingPercentage;
    public nexttPlugin: ITelemetryPlugin;


    constructor() {
        this.processTelemetry = this._processTelemetry.bind(this);
        this.initialize = this._start.bind(this);
        this.setNextPlugin = this._setNextPlugin.bind(this);
    }

    private _processTelemetry(env: ITelemetryItem) {
        if (!env) {
            throw Error("Invalid telemetry object");
        }
    }

    private _start(config: IConfiguration) {
        if (!config) {
            throw Error("required configuration missing");            
        }

        let pluginConfig = config.extensions ? config.extensions[this.identifier] : null;
        this.samplingPercentage = pluginConfig? pluginConfig.samplingPercentage : 100;
    }

    private _setNextPlugin(next: ITelemetryPlugin) : void {
        this.nexttPlugin = next;
    }
}

class ChannelPlugin implements IChannelControls {

    public isFlushInvoked = false;
    public isTearDownInvoked = false;
    public isResumeInvoked = false;
    public isPauseInvoked = false;

    constructor() {
        this.processTelemetry = this._processTelemetry.bind(this);
    }
    public pause(): void {
        this.isPauseInvoked = true;
    }    
    
    public resume(): void {
        this.isResumeInvoked = true;
    }

    public teardown(): void {
        this.isTearDownInvoked = true;
    }

    flush(async?: boolean, callBack?: () => void): void {
        this.isFlushInvoked = true;
        if (callBack) {
            callBack();
        }
    }

    public processTelemetry;

    public identifier = "Sender";
    
    setNextPlugin: (next: ITelemetryPlugin) => {
    }

    public priority: number = 101;

    public initialize = (config: IConfiguration) => {
    }

    private _processTelemetry(env: ITelemetryItem) {

    }
}

class TestPlugin implements IPlugin {
    private _config: IConfiguration;

    public initialize(config: IConfiguration) {
        this._config = config;
        // do custom one time initialization
    }

}