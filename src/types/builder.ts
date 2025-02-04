import { App, ButtonPressHandler, FunctionsToGeneratorType, WindowFunction, WindowWithFunctionsNames } from "./base.js";
import { JsonSchemaProperty } from "./jsonschema.js";

class FunctionsCollector<F extends Record<string, any>, STATE> {

    private functions: F = {} as F;

    add<KEY extends string, DESCRIPTION extends string, VALUE extends JsonSchemaProperty>(functionName: KEY, generator: ((state: STATE) => { functionDescription: DESCRIPTION, schema: VALUE })) {
        // @ts-ignore
        this.functions[functionName] = generator;
        return this as unknown as FunctionsCollector<F & { [K in KEY]: {
            name: K,
            description: DESCRIPTION,
            parameters: VALUE
        } }, STATE>;
    }

    getFunctions() {
        return this.functions;
    }
}

export class AppBuilder<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> {
    constructor(private data: {

        functions?: FunctionsToGeneratorType<FUNCTIONS, STATE>,
        stateGenerator?: () => STATE,
        windowGenerator?: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        buttonPressHandler?: ButtonPressHandler<FUNCTIONS, STATE>
    }) { }


    static start() {
        return new AppBuilder({}) as unknown as Pick<AppBuilder<any, any>, 'setState'>;
    }

    setFunctionsSchemasGenerator<NEW_FUNCTIONS extends Record<string, any>>(collector: (functionCollector: FunctionsCollector<{}, STATE>) => FunctionsCollector<NEW_FUNCTIONS, STATE>) {
        this.data.functions = collector(new FunctionsCollector()).getFunctions() as unknown as FunctionsToGeneratorType<FUNCTIONS, STATE>;
        return this as unknown as Pick<AppBuilder<NEW_FUNCTIONS, STATE>, 'setWindowGenerator'>;
    }

    setState<NEW_STATE>(stateGenerator: () => NEW_STATE) {
        this.data.stateGenerator = stateGenerator as any;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, NEW_STATE>, 'setFunctionsSchemasGenerator'>;
    }

    setWindowGenerator(generator: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>) {
        this.data.windowGenerator = generator;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, STATE>, 'setButtonPressHandler'>;
    }

    setButtonPressHandler(handler: ButtonPressHandler<FUNCTIONS, STATE>) {
        this.data.buttonPressHandler = handler;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, STATE>, 'build'>;
    }

    build() {
        if (!this.data.functions) throw new Error("Functions not set");
        if (!this.data.stateGenerator) throw new Error("State generator not set");
        if (!this.data.windowGenerator) throw new Error("Window generator not set");
        if (!this.data.buttonPressHandler) throw new Error("Button press handler not set");

        return new App(
            this.data.stateGenerator(),
            this.data.windowGenerator,
            this.data.buttonPressHandler,
            this.data.functions
        );
    }
}
