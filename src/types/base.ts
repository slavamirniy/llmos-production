import { JsonSchemaProperty, JsonSchemaToType } from "./jsonschema.js";

export type WindowFunction<PROPS extends JsonSchemaProperty & { type: "object" }, INFO extends { name: string, description: string }> = {
    name: INFO['name'],
    description: INFO['description'],
    parameters: PROPS
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

export type FunctionsToGeneratorType<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> = { [K in keyof FUNCTIONS]: (state: STATE) => { functionDescription: FUNCTIONS[K]['description'], schema: FUNCTIONS[K]['parameters'] } };

export class App<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> {
    constructor(
        public state: STATE,
        private windowGenerator: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        private buttonPressHandler: ButtonPressHandler<FUNCTIONS, STATE>,
        private functions?: FunctionsToGeneratorType<FUNCTIONS, STATE>
    ) { }

    private generateWindow = (state: STATE) => this.windowGenerator(state, this.generateWindow);

    getCurrentWindow(): WindowWithFunctions<FUNCTIONS> {
        const window = this.windowGenerator(this.state, this.generateWindow);
        return this.prepareWindow(window);
    }


    private prepareWindow(window: WindowWithFunctionsNames<FUNCTIONS>): WindowWithFunctions<FUNCTIONS> {

        const functions = window.availableFunctions.map(v => ({
            name: v,
            function: this.functions![v](this.state)
        }))

        return {
            messages: window.messages,
            availableFunctions: functions.map(v => ({
                type: 'function', function: {
                    name: v.name,
                    description: v.function.functionDescription,
                    parameters: v.function.schema
                }
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
            generateWindow: (state: STATE) => this.windowGenerator(state, this.generateWindow)
        });
        this.state = newstate;
    }
}
