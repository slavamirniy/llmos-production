import { Addon, App, ButtonPressHandler, IApp, WindowFunction, WindowWithFunctionsNames } from "./base.js";
import { JsonSchemaProperty, JsonSchemaToType } from "./jsonschema.js";

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
export type InferFunctionsFromFunctionsGenerator<T> = T extends FunctionsGenerator<infer F, any> ? F : never;


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

export type FunctionsMiddleware<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>, BASESTATE extends Record<string, any>> = (functions: FUNCTIONS, addonState: STATE, appState: BASESTATE) => FUNCTIONS;
export type WindowMiddleware<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>, BASESTATE extends Record<string, any>> = (window: WindowWithFunctionsNames<FUNCTIONS>, addonState: STATE, appState: BASESTATE) => WindowWithFunctionsNames<FUNCTIONS>;
export type BasePromptMiddleware<STATE extends Record<string, any>> = (prompt: string, addonState: STATE, appState: STATE) => string;
export type AppDescriptionMiddleware = (appDescription: string) => string;
export type ButtonPressHandlerMiddleware<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>, BASESTATE extends Record<string, any>> = (data: {
    function: { [K in keyof FUNCTIONS]: {
        name: K,
        args: JsonSchemaToType<FUNCTIONS[K]['parameters']>
    } }[keyof FUNCTIONS],
    appState: { get: () => BASESTATE },
    addonState: { get: () => STATE },
}) => STATE;


class AddonBuilder<BASEAPP extends IApp<any, any>, FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE extends Record<string, any>> {


    constructor(private data: {
        app?: BASEAPP,
        functionsMiddleware?: FunctionsMiddleware<FUNCTIONS, STATE, BASEAPP['state']>,
        stateGenerator?: () => STATE,
        windowMiddleware?: WindowMiddleware<FUNCTIONS, STATE, BASEAPP['state']>,
        buttonPressHandlerMiddleware?: ButtonPressHandlerMiddleware<FUNCTIONS, STATE, BASEAPP['state']>,
        basePromptMiddleware?: BasePromptMiddleware<STATE>,
        appDescriptionMiddleware?: AppDescriptionMiddleware

    }) { }


    static start<APP extends App<any, any>>() {
        return new AddonBuilder<APP, any, any>({}) as unknown as Pick<AddonBuilder<APP, any, any>, 'setState'>;
    }

    // @ts-ignore
    setFunctionsSchemasMiddleware<NEW_FUNCTIONS extends InferFunctionsFromFunctionsGenerator<BASEAPP['functionsGenerator']>>(middleware: FunctionsMiddleware<NEW_FUNCTIONS, STATE, BASEAPP['state']>) {
        this.data.functionsMiddleware = middleware as unknown as FunctionsMiddleware<FUNCTIONS, STATE, BASEAPP['state']>;
        return this as unknown as Pick<AddonBuilder<BASEAPP, NEW_FUNCTIONS, STATE>, 'setWindowMiddleware'>;
    }

    setState<NEW_STATE extends STATE>(stateGenerator: () => NEW_STATE) {
        this.data.stateGenerator = stateGenerator as any;
        return this as unknown as Pick<AddonBuilder<BASEAPP, FUNCTIONS, NEW_STATE>, 'setFunctionsSchemasMiddleware'>;
    }

    setWindowMiddleware(middleware: WindowMiddleware<FUNCTIONS, STATE, BASEAPP['state']>) {
        this.data.windowMiddleware = middleware;
        return this as unknown as Pick<AddonBuilder<BASEAPP, FUNCTIONS, STATE>, 'setButtonPressHandlerMiddleware'>;
    }


    setButtonPressHandlerMiddleware(middleware: ButtonPressHandlerMiddleware<FUNCTIONS, STATE, BASEAPP['state']>) {
        this.data.buttonPressHandlerMiddleware = middleware;
        return this as unknown as Pick<AddonBuilder<BASEAPP, FUNCTIONS, STATE>, 'setBasePromptMiddleware'>;
    }



    setBasePromptMiddleware(middleware: BasePromptMiddleware<STATE>) {
        this.data.basePromptMiddleware = middleware;
        return this as unknown as Pick<AddonBuilder<BASEAPP, FUNCTIONS, STATE>, 'setAppDescriptionMiddleware'>;
    }


    setAppDescriptionMiddleware(middleware: AppDescriptionMiddleware) {
        this.data.appDescriptionMiddleware = middleware;
        return this as unknown as Pick<AddonBuilder<BASEAPP, FUNCTIONS, STATE>, 'setApp'>;
    }

    setApp(app: BASEAPP) {
        this.data.app = app;
        return this as unknown as Pick<AddonBuilder<BASEAPP, FUNCTIONS, STATE>, 'build'>;
    }

    build(initAddonState?: Partial<STATE>) {
        if (!this.data.functionsMiddleware) throw new Error("Functions middleware not set");

        if (!this.data.stateGenerator) throw new Error("State generator not set");
        if (!this.data.windowMiddleware) throw new Error("Window middleware not set");
        if (!this.data.buttonPressHandlerMiddleware) throw new Error("Button press handler middleware not set");
        if (!this.data.basePromptMiddleware) throw new Error("Base prompt middleware not set");
        if (!this.data.appDescriptionMiddleware) throw new Error("App description middleware not set");
        if (!this.data.app) throw new Error("App not set");

        const addon = new Addon(this.data.app, this.data.stateGenerator(), {
            appDescriptionMiddleware: this.data.appDescriptionMiddleware,
            basePromptMiddleware: this.data.basePromptMiddleware,
            buttonPressHandlerMiddleware: this.data.buttonPressHandlerMiddleware,
            functionsMiddleware: this.data.functionsMiddleware,
            stateGenerator: this.data.stateGenerator,
            windowMiddleware: this.data.windowMiddleware,
        });

        if (initAddonState) {
            addon.state = { ...addon.state, ...initAddonState };
        }

        return addon;
    }

}

class AddonsCollector<APP extends IApp<any, any>> {
    private constructor(private app: APP) { }

    static from<APP extends App<any, any>>(app: APP): AddonsCollector<APP> {
        return new AddonsCollector(app);
    }

    use<NEW_APP extends IApp<any, any>>(addon: AddonBuilder<APP, any, any>): AddonsCollector<NEW_APP> {
        this.app = addon.setApp(this.app).build() as unknown as APP;
        return this as unknown as AddonsCollector<NEW_APP>;
    }


    build(): APP {
        return this.app;
    }
}