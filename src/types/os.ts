import { App, Message, WindowFunction, WindowWithFunctions } from "./base.js";
import { AppBuilder } from "./builder.js";

export type Tool = {
    type: "function",
    function: WindowFunction<any, any>
}


function throwIfDuplicateToolName(tools: Tool[]) {
    const toolNames = new Set<string>();
    for (const tool of tools) {
        if (toolNames.has(tool.function.name)) {
            throw new Error(`Duplicate tool name found: ${tool.function.name}`);
        }
    }
}

const OSApp = AppBuilder
    .start()
    .setState(() => ({
        opennedApps: [] as string[],
        apps: {} as Record<string, App<any, any>>,
        windowsMap: {} as Record<string, WindowWithFunctions<any>>
    }))
    .setFunctionsSchemasGenerator((v, state) => {
        const collector = v;
        if (state.opennedApps.length === 0) {
            collector
                .add("closeApp",
                    "Закрыть приложение", {
                    type: "object",
                    properties: {},
                    required: []
                })
                .add("openApp", "Открыть приложение", {
                    type: "object",
                    properties: {
                        appName: { type: "string", enum: Object.keys(state.apps) }
                    },
                    required: ["appName"]
                })
            return collector;
        }

        const window = state.opennedApps.map(appName => state.windowsMap[appName]);
        const tools = window.map(v => v.availableFunctions).flat();

        tools.forEach(tool => {
            collector.add(tool.function.name, tool.function.description, tool.function.parameters)
        })

        return collector as any;
    })
    .setWindowGenerator(state => {

        const appNames = Object.keys(state.apps);

        if (state.opennedApps.length === 0) {
            return {
                availableFunctions: ['openApp'],
                messages: [{
                    role: "system",
                    content: "Доступные приложения: " + appNames.join(", ")
                }]
            }
        }

        state.windowsMap = Object.fromEntries(state.opennedApps.map(app => [app, state.apps[app].getCurrentWindow()]));
        const window = state.opennedApps.map(appName => state.windowsMap[appName]);
        const tools = window.map(v => v.availableFunctions).flat();
        const messages = window.map(v => v.messages).flat();
        throwIfDuplicateToolName(tools);

        return {
            availableFunctions: tools.map(v => v.function.name),
            messages: messages
        }
    })
    .setButtonPressHandler(data => {
        const state = data.state.get();
        if (data.function.name === "closeApp") {
            state.opennedApps = [];
            return state;
        }

        if (data.function.name === "openApp") {
            state.opennedApps = [((data.function.args as any).appName as string)];
            return state;
        }


        const app = state.opennedApps.find(app =>
            state.windowsMap[app].availableFunctions.some(f => f.function.name === data.function.name)
        );

        if (!app) {
            throw new Error(`App not found for tool call: ${data.function.name}`);
        }

        state.apps[app].pressButton(data.function.name, data.function.args);

        return state;
    })
    .setBasePromptGenerator(state =>
        "Вы находитесь в опреационной системе. Здесь есть разные приложения. Вы можете открывать их с помощью tools - openApp и закрывать с помощью tools - closeApp.\n" +
        "Описание доступных приложений: " + Object.keys(state.apps).map(app => "Приложение " + app + ": " + state.apps[app].getAppDescription()).join("\n") + "\n" +
        (state.opennedApps.length > 0 ? ("Контекст открытых приложений: " + state.opennedApps.map(app => state.apps[app].getBasePrompt()).join("\n") + "\n") : "")
    )
    .setAppDescription("Это опреационная система. Вы можете открывать и закрывать приложения.")


export class LLMOS<APPS extends Record<string, App<any, any>>> {
    private data: {
        LLMRequestFunction: (messages: Message[], tools: Tool[]) => Promise<{
            tool_call?: {
                name: string,
                arguments: any
            }
        }>,
        apps: APPS,
        goal: string,
    };


    private OSApp = OSApp.build();
    private currentWindow: {
        basePrompt: string,
        messages: Message[],
        tools: Tool[]
    } = {
            basePrompt: "",
            messages: [],
            tools: []
        }


    constructor(data: typeof this.data) {
        this.data = data;
        this.OSApp.state.apps = this.data.apps;
    }

    async act() {
        const basePrompt = this.OSApp.getBasePrompt();
        const messages = this.OSApp.getCurrentWindow().messages;
        const tools = this.OSApp.getCurrentWindow().availableFunctions;
        const windowMessages = [{ role: "user", content: basePrompt }, { role: "system", content: this.data.goal }, ...messages];

        this.currentWindow = {
            basePrompt: basePrompt,
            messages: windowMessages,
            tools: tools
        }

        const response = await this.data.LLMRequestFunction(windowMessages, tools);

        if (!response.tool_call) {
            // throw new Error("No tool call found");
            console.log("No tool call found");
            return;
        }


        const { name: toolCallName, arguments: toolCallArgs } = response.tool_call;

        this.OSApp.pressButton(toolCallName, toolCallArgs);
    }

    getCurrentWindow() {
        return this.currentWindow;
    }

}