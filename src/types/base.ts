import { FunctionsGenerator, FunctionsCollector, AppDescriptionMiddleware, FunctionsMiddleware, WindowMiddleware, BasePromptMiddleware, ButtonPressHandlerMiddleware } from "./builder.js";
import { JsonSchemaProperty, JsonSchemaToType } from "./jsonschema.js";

export type WindowFunction<PROPS extends JsonSchemaProperty & { type: "object" }, INFO extends { name: string, description: string }> = {
    name: INFO['name'],
    description: INFO['description'],
    parameters: PROPS,
}


export type Message = {
    role: string,
    content: string
}

export type WindowWithFunctionsNames<FUNCTIONS extends Record<string, WindowFunction<any, any>>> = {
    messages: Message[],
    availableFunctions: (keyof FUNCTIONS)[]
}


export type WindowWithFunctions<FUNCTIONS extends Record<string, WindowFunction<any, any>>> = {
    messages: Message[],
    availableFunctions: { type: 'function', function: FUNCTIONS[keyof FUNCTIONS] }[]
}


export type ButtonPressHandler<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> = (data: {
    function: { [K in keyof FUNCTIONS]: {
        name: K,
        args: JsonSchemaToType<FUNCTIONS[K]['parameters']>
    } }[keyof FUNCTIONS],
    state: { get: () => STATE },
    generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>
}) => STATE;

export type FunctionsToGeneratorType<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> = { [K in keyof FUNCTIONS]: (state: STATE) => { functionDescription: FUNCTIONS[K]['description'], schema: FUNCTIONS[K]['parameters'] } };

export interface IApp<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> {
    state: STATE;
    getCurrentWindow(): WindowWithFunctions<FUNCTIONS>;
    getBasePrompt(): string;
    getAppDescription(): string;
    pressButton<FUNCTION_NAME extends keyof FUNCTIONS>(functionName: FUNCTION_NAME, args: JsonSchemaToType<FUNCTIONS[FUNCTION_NAME]['parameters']>): void;
    getGenerators(): {
        windowGenerator: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        buttonPressHandler: ButtonPressHandler<FUNCTIONS, STATE>,
        functionsGenerator: FunctionsGenerator<FUNCTIONS, STATE>,
        basePromptGenerator: (state: STATE) => string,
        appDescription: string
    }
}

export class App<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> implements IApp<FUNCTIONS, STATE> {
    constructor(
        public state: STATE,
        private windowGenerator: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        private buttonPressHandler: ButtonPressHandler<FUNCTIONS, STATE>,
        private functionsGenerator: FunctionsGenerator<FUNCTIONS, STATE>,
        private basePromptGenerator: (state: STATE) => string,
        private appDescription: string

    ) { }

    private generateWindow = (state: STATE) => this.windowGenerator(state, this.generateWindow);

    getCurrentWindow(): WindowWithFunctions<FUNCTIONS> {
        const window = this.windowGenerator(this.state, this.generateWindow);
        return this.prepareWindow(window);
    }

    getBasePrompt(): string {
        return this.basePromptGenerator(this.state);
    }

    getAppDescription(): string {
        return this.appDescription;
    }

    private prepareWindow(window: WindowWithFunctionsNames<FUNCTIONS>): WindowWithFunctions<FUNCTIONS> {
        const currentFunctions = this.functionsGenerator(new FunctionsCollector(), this.state).getFunctions();
        const functions = window.availableFunctions.map(v => ({
            name: v,
            function: currentFunctions[v]
        }))

        return {
            messages: window.messages,
            availableFunctions: functions.map(v => ({
                type: 'function', function: {
                    name: v.name,
                    description: v.function.description,
                    parameters: v.function.parameters,
                } as FUNCTIONS[keyof FUNCTIONS]
            }))
        }
    }

    pressButton<FUNCTION_NAME extends keyof FUNCTIONS>(
        functionName: FUNCTION_NAME,
        args: JsonSchemaToType<FUNCTIONS[FUNCTION_NAME]['parameters']>
    ): void {
        const newstate = this.buttonPressHandler({
            function: {
                name: functionName,
                args
            },
            state: {
                get: () => this.state
            },
            generateWindow: this.generateWindow
        });
        this.state = newstate;
    }

    getGenerators() {
        return {
            windowGenerator: this.windowGenerator,
            buttonPressHandler: this.buttonPressHandler,
            functionsGenerator: this.functionsGenerator,
            basePromptGenerator: this.basePromptGenerator,
            appDescription: this.appDescription
        }
    }

}


export class Addon<BASEAPP extends IApp<any, any>, FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> implements IApp<FUNCTIONS, STATE> {
    constructor(
        private app: BASEAPP,
        private addonState: STATE,
        private data: {
            functionsMiddleware: FunctionsMiddleware<FUNCTIONS, STATE, BASEAPP['state']>,
            stateGenerator: () => STATE,
            windowMiddleware: WindowMiddleware<FUNCTIONS, STATE, BASEAPP['state']>,
            buttonPressHandlerMiddleware: ButtonPressHandlerMiddleware<FUNCTIONS, STATE, BASEAPP['state']>,
            basePromptMiddleware: BasePromptMiddleware<STATE>,
            appDescriptionMiddleware: AppDescriptionMiddleware
        }
    ) {

    }
    
    getGenerators() {
        return this.app.getGenerators();
    }


    get state() {
        return this.app.state;
    }

    set state(state: STATE) {
        this.app.state = state;
    }

    private generateWindow = (state: STATE) => {
        const window = this.app.getGenerators().windowGenerator(state, this.generateWindow);
        const windowMiddlewared = this.data.windowMiddleware(window, this.addonState, this.app.state);
        return windowMiddlewared;
    }


    getCurrentWindow(): WindowWithFunctions<FUNCTIONS> {
        const window = this.app.getGenerators().windowGenerator(this.app.state, this.generateWindow);
        const windowMiddlewared = this.data.windowMiddleware(window, this.addonState, this.app.state);
        return this.prepareWindow(windowMiddlewared);
    }

    getBasePrompt(): string {
        const basePrompt = this.app.getGenerators().basePromptGenerator(this.app.state);
        const basePromptMiddlewared = this.data.basePromptMiddleware(basePrompt, this.addonState, this.app.state);
        return basePromptMiddlewared;
    }


    getAppDescription(): string {
        const appDescription = this.app.getGenerators().appDescription;
        const appDescriptionMiddlewared = this.data.appDescriptionMiddleware(appDescription);
        return appDescriptionMiddlewared;
    }

    private prepareWindow(window: WindowWithFunctionsNames<FUNCTIONS>): WindowWithFunctions<FUNCTIONS> {
        const currentFunctions = this.app.getGenerators().functionsGenerator(new FunctionsCollector(), this.addonState).getFunctions();
        const middlewaredFunctions = this.data.functionsMiddleware(currentFunctions, this.addonState, this.app.state);
        const functions = window.availableFunctions.map(v => ({
            name: v,
            function: middlewaredFunctions[v]
        }))

        return {
            messages: window.messages,
            availableFunctions: functions.map(v => ({
                type: 'function', function: {
                    name: v.name,
                    description: v.function.description,
                    parameters: v.function.parameters,
                } as FUNCTIONS[keyof FUNCTIONS]
            }))
        }
    }

    pressButton<FUNCTION_NAME extends keyof FUNCTIONS>(
        functionName: FUNCTION_NAME,
        args: JsonSchemaToType<FUNCTIONS[FUNCTION_NAME]['parameters']>
    ): void {
        const appstate = this.app.getGenerators().buttonPressHandler({
            function: {
                name: functionName as any,
                args
            },
            state: {
                get: () => this.state
            },
            generateWindow: this.generateWindow
        });

        this.app.state = appstate;
        
        const addonstate = this.data.buttonPressHandlerMiddleware({
            function: {
                name: functionName as any,
                args
            },
            appState: {
                get: () => this.app.state,
            },
            addonState: {
                get: () => this.addonState,
            }
        });

        this.addonState = addonstate;
    }
}
