import { App, ButtonPressHandler, FunctionsToGeneratorType, WindowFunction, WindowWithFunctionsNames } from "./base.js";
import { JsonSchemaProperty } from "./jsonschema.js";

export class FunctionsCollector<F extends Record<string, any>, STATE> {

    private functions: F = {} as F;

    add<KEY extends string, DESCRIPTION extends string, VALUE extends JsonSchemaProperty>(functionName: KEY, description: DESCRIPTION, schema: VALUE) {
        // @ts-ignore
        this.functions[functionName] = {
            name: functionName,
            description,
            parameters: schema
        }
        return this as unknown as FunctionsCollector<F & { [K in KEY]: {
            name: K,
            description: DESCRIPTION,
            parameters: VALUE,
        } }, STATE>;
    }


    getFunctions() {
        return this.functions;
    }
}


export type FunctionsGenerator<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> = (functionCollector: FunctionsCollector<{}, STATE>, state: STATE) => FunctionsCollector<FUNCTIONS, STATE>;

export class AppBuilder<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> {
    constructor(private data: {
        functionsGenerator?: FunctionsGenerator<FUNCTIONS, STATE>,
        stateGenerator?: () => STATE,
        windowGenerator?: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        buttonPressHandler?: ButtonPressHandler<FUNCTIONS, STATE>,
        basePromptGenerator?: (state: STATE) => string,
        appDescription?: string

    }) { }


    static start() {
        return new AppBuilder({}) as unknown as Pick<AppBuilder<any, any>, 'setState'>;
    }

    setFunctionsSchemasGenerator<NEW_FUNCTIONS extends Record<string, any>>(generator: FunctionsGenerator<NEW_FUNCTIONS, STATE>) {
        this.data.functionsGenerator = generator as unknown as FunctionsGenerator<FUNCTIONS, STATE>;
        return this as unknown as Pick<AppBuilder<NEW_FUNCTIONS, STATE>, 'setWindowGenerator'>;
    }

    setState<NEW_STATE extends STATE>(stateGenerator: () => NEW_STATE) {
        this.data.stateGenerator = stateGenerator as any;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, NEW_STATE>, 'setFunctionsSchemasGenerator'>;
    }

    setWindowGenerator(generator: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>) {
        this.data.windowGenerator = generator;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, STATE>, 'setButtonPressHandler'>;
    }

    setButtonPressHandler(handler: ButtonPressHandler<FUNCTIONS, STATE>) {
        this.data.buttonPressHandler = handler;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, STATE>, 'setBasePromptGenerator'>;
    }

    setBasePromptGenerator(generator: (state: STATE) => string) {
        this.data.basePromptGenerator = generator;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, STATE>, 'setAppDescription'>;
    }


    setAppDescription(description: string) {
        this.data.appDescription = description;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, STATE>, 'build'>;
    }

    build(initState?: Partial<STATE>) {
        if (!this.data.functionsGenerator) throw new Error("Functions generator not set");


        if (!this.data.stateGenerator) throw new Error("State generator not set");
        if (!this.data.windowGenerator) throw new Error("Window generator not set");
        if (!this.data.buttonPressHandler) throw new Error("Button press handler not set");
        if (!this.data.basePromptGenerator) throw new Error("Base prompt generator not set");

        const app = new App(
            this.data.stateGenerator(),
            this.data.windowGenerator,
            this.data.buttonPressHandler,
            this.data.functionsGenerator,
            this.data.basePromptGenerator,
            this.data.appDescription ?? ""
        );


        if (initState) {
            app.state = { ...app.state, ...initState };
        }

        return app;
    }

}
