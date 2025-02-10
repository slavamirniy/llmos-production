import { App, IApp, Message, WindowFunction, WindowWithFunctions } from "./base.js";
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

export const OSAppBuilder = AppBuilder
    .start()
    .setState(() => ({
        opennedApps: [] as string[],
        apps: {} as Record<string, IApp<any, any>>,
        windowsMap: {} as Record<string, WindowWithFunctions<any>>,
        goal: "" as string
    }))
    .setFunctionsSchemasGenerator((v, state) => {
        const collector = v;

        const window = state.opennedApps.map(appName => state.windowsMap[appName]);
        const tools = window.map(v => v.availableFunctions).flat();

        tools.forEach(tool => {
            collector.add(tool.function.name, tool.function.description, tool.function.parameters)
        })

        const availableApps = Object.keys(state.apps).filter(app => !state.opennedApps.includes(app));
        if (availableApps.length > 0) {
            collector.add("openApp", "Open application", {
                type: "object",
                properties: {
                    appName: { type: "string", enum: availableApps }
                },
                required: ["appName"]
            })
        }

        return collector as any;
    })
    // @ts-ignore
    .setWindowGenerator(state => {

        const appNames = Object.keys(state.apps);

        if (state.opennedApps.length === 0) {
            return {
                availableFunctions: ['openApp'],
                messages: [{
                    role: "system",
                    content: "Available applications: " + appNames.join(", ")
                }]
            }
        }

        state.windowsMap = Object.fromEntries(state.opennedApps.map(app => [app, state.apps[app].getCurrentWindow()]));
        const window = state.opennedApps.map(appName => state.windowsMap[appName]);
        const tools = window.map(v => v.availableFunctions).flat();
        const messages = window.map(v => v.messages).flat();
        throwIfDuplicateToolName(tools);

        return {
            availableFunctions: [tools.map(v => v.function.name), 'openApp'],
            messages: messages
        }
    })
    .setButtonPressHandler(data => {
        const state = data.state.get();

        if (data.function.name === "openApp") {
            state.opennedApps = [((data.function.args as any).appName as string)];
            return state;
        }


        const app = state.opennedApps.find(app =>
            state.windowsMap[app].availableFunctions.some(f => f.function.name === data.function.name)
        );

        if (!app) {
            // throw new Error(`App not found for tool call: ${data.function.name}`);
            return state;
        }

        state.apps[app].pressButton(data.function.name, data.function.args);

        return state;
    })
    .setBasePromptGenerator(state =>
        "GOAL: " + state.goal + "\n" +
        "You are in an operating system. There are different applications here. You can open them using tools - openApp and close them using tools - closeApp.\n" +
        "Description of available applications: " + Object.keys(state.apps).map(app => "Application " + app + ": " + state.apps[app].getAppDescription()).join("\n") + "\n" +
        (state.opennedApps.length > 0 ? ("Context of opened applications: " + state.opennedApps.map(app => state.apps[app].getBasePrompt()).join("\n") + "\n") : "")
    )
    .setAppDescription("This is an operating system. You can open and close applications.")


export class AppExecutor {
    constructor(
        private LMRequestFunction: (messages: Message[], tools: Tool[]) => Promise<{
            tool_call?: {
                name: string;
                arguments: any;
            };
        }>,
        public readonly app: IApp<any, any>
    ) {
    }

    async act() {
        const basePrompt = this.app.getBasePrompt();
        const window = this.app.getCurrentWindow();
        const messages = window.messages;
        const tools = window.availableFunctions;
        const windowMessages = [{ role: "user", content: basePrompt }, ...messages];

        const response = await this.LMRequestFunction(windowMessages, tools);

        if (!response.tool_call) {
            // throw new Error("No tool call found");
            console.log("No tool call found");
            return;
        }


        const { name: toolCallName, arguments: toolCallArgs } = response.tool_call;

        this.app.pressButton(toolCallName, toolCallArgs);
    }
}