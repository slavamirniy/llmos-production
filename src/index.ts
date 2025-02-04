import { makeGptRequest } from "./gpt.js";
import express from "express";
import path from "path";

type JsonSchemaProperty =
    | { type: "string"; description?: string }
    | { type: "number"; description?: string }
    | { type: "boolean"; description?: string }
    | { type: "array"; items: JsonSchemaProperty; description?: string }
    | { type: "object"; properties: Record<string, JsonSchemaProperty>; required: string[]; description?: string }


type JsonSchemaToType<T> = T extends { type: string } ?
    T extends { type: "string" } ? string :
    T extends { type: "number" } ? number :
    T extends { type: "boolean" } ? boolean :
    T extends { type: "array"; items: infer I } ? JsonSchemaToType<I>[] :
    T extends { type: "object"; properties: infer P; required: infer R } ?
    // @ts-ignore
    { -readonly [K in keyof P]: K extends R[number] ? JsonSchemaToType<P[K]> : JsonSchemaToType<P[K]> | undefined } :
    never : never;

function defineSchema<T extends JsonSchemaProperty>(schema: T): T {
    return schema;
}

type WindowFunction<PROPS extends JsonSchemaProperty & { type: "object" }, INFO extends { name: string, description: string }> = {
    name: INFO['name'],
    description: INFO['description'],
    parameters: PROPS
}

class FunctionsCollector<F extends Record<string, any>> {

    private functions: F = {} as F;

    add<KEY extends string, DESCRIPTION extends string, VALUE extends JsonSchemaProperty>(functionName: KEY, functionDescription: DESCRIPTION, schema: VALUE) {
        const data = {
            name: functionName,
            description: functionDescription,
            parameters: schema
        } as unknown as F[KEY];
        this.functions[functionName as keyof F] = data;
        return this as unknown as FunctionsCollector<F & { [K in KEY]: {
            name: K,
            description: DESCRIPTION,
            parameters: VALUE
        } }>;
    }

    getFunctions() {
        return this.functions;
    }
}

type Message = {
    role: string,
    content: string
}

type WindowWithFunctionsNames<FUNCTIONS extends Record<string, WindowFunction<any, any>>> = {
    messages: Message[],
    availableFunctions: (keyof FUNCTIONS)[]
}

type WindowWithFunctions<FUNCTIONS extends Record<string, WindowFunction<any, any>>> = {
    messages: Message[],
    availableFunctions: { type: 'function', function: FUNCTIONS[keyof FUNCTIONS] }[]
}

type ButtonPressHandler<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> = (data: {
    function: { [K in keyof FUNCTIONS]: {
        name: K,
        args: JsonSchemaToType<FUNCTIONS[K]['parameters']>
    } }[keyof FUNCTIONS],
    state: { get: () => STATE },
    generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>
}) => STATE

class AppBuilder<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> {
    constructor(private data: {
        functions?: FUNCTIONS,
        stateGenerator?: () => STATE,
        windowGenerator?: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        buttonPressHandler?: ButtonPressHandler<FUNCTIONS, STATE>
    }) { }

    static start() {
        return new AppBuilder({}) as unknown as Pick<AppBuilder<any, any>, 'setFunctionsSchemas'>;
    }

    setFunctionsSchemas<NEW_FUNCTIONS extends Record<string, any>>(collector: (functionCollector: FunctionsCollector<{}>) => FunctionsCollector<NEW_FUNCTIONS>) {
        this.data.functions = collector(new FunctionsCollector()).getFunctions() as unknown as FUNCTIONS;
        return this as unknown as Pick<AppBuilder<NEW_FUNCTIONS, STATE>, 'setState'>;
    }

    setState<NEW_STATE>(stateGenerator: () => NEW_STATE) {
        this.data.stateGenerator = stateGenerator as any;
        return this as unknown as Pick<AppBuilder<FUNCTIONS, NEW_STATE>, 'setWindowGenerator'>;
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

class App<FUNCTIONS extends Record<string, WindowFunction<any, any>>, STATE> {
    constructor(
        public state: STATE,
        private windowGenerator: (state: STATE, generateWindow: (state: STATE) => WindowWithFunctionsNames<FUNCTIONS>) => WindowWithFunctionsNames<FUNCTIONS>,
        private buttonPressHandler: ButtonPressHandler<FUNCTIONS, STATE>,
        private functions: FUNCTIONS
    ) { }

    private generateWindow = (state: STATE) => this.windowGenerator(state, this.generateWindow);

    getCurrentWindow(): WindowWithFunctions<FUNCTIONS> {
        const window = this.windowGenerator(this.state, this.generateWindow);
        return this.prepareWindow(window);
    }


    private prepareWindow(window: WindowWithFunctionsNames<FUNCTIONS>): WindowWithFunctions<FUNCTIONS> {
        return {
            messages: window.messages,
            availableFunctions: window.availableFunctions.map(v => ({ type: 'function', function: this.functions[v] }))
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


const chats: {
    members: [string, string],
    messages: {
        sender: string,
        content: string
    }[]
}[] = [
        {
            members: ["Олег", "Алекс"],
            messages: []
        }, {
            members: ["Олег", "Маша"],
            messages: []
        },
        {
            members: ["Алекс", "Маша"],
            messages: []
        }

    ]

const chatBuilder = AppBuilder
    .start()
    .setFunctionsSchemas(v => v
        .add("sendMessage",
            "Отправка сообщения в чат",
            {
                type: "object",
                properties: {
                    message: {
                        type: "string"
                    },
                    notes: {
                        type: "string",
                        description: "Ваши заметки по пути расследования"
                    }
                },
                required: ["message"]
            })

        .add("openChat",
            "Открытие чата с пользователем",
            {
                type: "object",
                properties: {
                    chatId: {
                        type: "string"
                    },
                    notes: {
                        type: "string",
                        description: "Ваши заметки по пути расследования"
                    }

                },
                required: ["chatId"]
            })


        .add("openChatList",
            "Открытие списка чатов",
            {
                type: "object",
                properties: {
                    notes: {
                        type: "string",
                        description: "Ваши заметки по пути расследования"
                    }
                },

                required: []

            }
        )

    )
    .setState(() => ({
        opennedChatId: undefined as string | undefined,
        userId: undefined as string | undefined,
        reasoning: [] as string[]
    }))
    .setWindowGenerator((state, generateWindow) => {
        const userId = state.userId;
        const additionalMessages = state.reasoning ? [{ content: "Ваш ход размышлений:\n" + state.reasoning.map((reason, index) => `${index + 1}. ${reason}`).join("\n"), role: "system" }] : [];
        if (!userId) return {
            messages: [{ content: "Вы не авторизованы", role: "system" }],
            availableFunctions: []
        };

        if (!state.opennedChatId) {
            const avaliableChats = chats.filter(chat => chat.members.includes(userId));
            const avaliableUsers = avaliableChats
                .map(chat => chat.members.find(member => member !== userId))
                .filter(user => user !== undefined);
            const avaliableUsersString = avaliableUsers.join(", ");

            return {
                messages: [...additionalMessages, { content: "Список доступных пользователей для общения:\n" + avaliableUsersString, role: "system" }],
                availableFunctions: ["openChat"]
            };


        }

        const chat = chats.find(chat => chat.members.includes(userId) && chat.members.includes(state.opennedChatId!));
        if (!chat) return generateWindow({
            ...state,
            opennedChatId: undefined
        });

        const messages = chat.messages
            .map(message => (message.sender === userId ?
                {
                    content: "Вы: " + message.content,
                    role: "assistant"
                } :
                {
                    content: message.sender + ": " + message.content,
                    role: "user"
                }
            ))


        const allowSendMessage = chat.messages.at(-1)?.sender !== userId;

        return {
            messages: [
                ...additionalMessages,
                {
                    content: "У вас открыт чат с " + state.opennedChatId,
                    role: "system"
                },
                ...messages
            ],
            availableFunctions: ["openChatList", ...(allowSendMessage ? ["sendMessage"] : [])]
            // availableFunctions: ["openChatList", "sendMessage"]
        };
    })

    .setButtonPressHandler((data) => {
        const currentState = data.state.get();

        if (data.function.name === "sendMessage") {
            if (!currentState.opennedChatId) {
                return currentState;
            }

            chats.find(chat => chat.members.includes(currentState.opennedChatId!) && chat.members.includes(data.state.get().userId!))!.messages.push({
                sender: currentState.userId!,
                content: data.function.args.message
            });

            return currentState;
        }

        if (data.function.name === "openChat") {
            currentState.opennedChatId = data.function.args.chatId;
        }

        if (data.function.name === "openChatList") {
            currentState.opennedChatId = undefined;
        }

        if (data.function.args.notes !== undefined) {
            currentState.reasoning = [...currentState.reasoning, data.function.args.notes!];
        }


        return currentState;
    })

class ChatAgent {

    private prevWindow: WindowWithFunctions<any> | undefined;

    constructor(private app: App<any, any>, private userId: string, private actAs: string) {
        this.app.state.userId = userId;
    }

    async act() {
        let currentWindow = this.app.getCurrentWindow();
        if (JSON.stringify(currentWindow) === JSON.stringify(this.prevWindow)) {
            return;
        }
        this.prevWindow = currentWindow;

        console.log(this.app.state.userId, currentWindow);

        let response = await makeGptRequest(
            [{ role: 'system', content: `Тебя зовут ${this.userId}. Твоя задача, используя tools, пообщаться с пользователями. Ты можешь заходить в чаты и писать пользователям. Если чувствуешь, что диалог закончен - можешь из него выйти и открыть другой чат. Принмается ответ только в виде tool_call. Веди по пути расследования заметки, чтобы тебе легче было ориентироваться. Это сценка, тебе нужно следовать следующему сценарию:` + this.actAs + `. Не отправляй текстовые сообщения, испольщуй tools всегда.` }, ...currentWindow.messages],
            currentWindow.availableFunctions
        );

        try {
            let toolCall = response.choices[0].message.tool_calls[0].function;
            let functionName = toolCall.name;
            let args = JSON.parse(toolCall.arguments);
            console.log(this.app.state.userId, "нажал", functionName, args.chatId ?? args.message);
            this.app.pressButton(functionName, args);
        } catch (err) {
            if (response.choices[0].message.content && this.app.state.opennedChatId !== undefined) {
                this.app.pressButton("sendMessage", { message: response.choices[0].message.content });
            }
            // console.log(err);
        }
    }

}

// сделать enum
// сделать чтобы могли писать повторно но не сразу
// аддоны могут
// - менять функции
// - менять поведение по нажатию кнопки

async function main() {
    const olegChat = chatBuilder.build();
    const alexChat = chatBuilder.build();
    const mashaChat = chatBuilder.build();

    const olegAgent = new ChatAgent(olegChat, "Олег", "Ты Олег, ты знаешь что кирман - это такая подкова для лошади. Но ты об этом не рассказываешь Алексу, а Маше можешь рассказать, если спросит. Твоя задача узнать, что такое бибмбук, кто-то из участников знает что это.");
    const alexAgent = new ChatAgent(alexChat, "Алекс", "Ты Алекс, ты знаешь что сунтюк - это такая расческа для кошек. Но ты об этом не рассказываешь Маше, а Олегу можешь рассказать, если спросит. Твоя задача узнать, что такое кирман, кто-то из участников знает что это.");
    const mashaAgent = new ChatAgent(mashaChat, "Маша", "Ты Маша, ты знаешь что бимбук - это такая палочка для собак. Но ты об этом не рассказываешь Олегу, а Алексу можешь рассказать, если спросит. Твоя задача узнать, что такое сунтюк, кто-то из участников знает что это.");

    const app = express();

    // Добавляем middleware для статических файлов
    app.use(express.static(path.join(process.cwd(), 'public')));

    app.get("/chats", (req, res) => {
        const chatsWithReasoning = chats.map(chat => ({
            ...chat,
            messages: [
                ...chat.messages,
                // Добавляем reasoning для каждого участника, если он есть
                ...[olegChat, alexChat, mashaChat]
                    .filter(agentChat => chat.members.includes(agentChat.state.userId!))
                    .map(agentChat => ({
                        sender: agentChat.state.userId!,
                        content: agentChat.state.reasoning ? "Текущая ситуация: " + agentChat.state.reasoning : ""
                    }))
                    .filter(message => message.content !== "")
            ]
        }));
        res.json(chatsWithReasoning);
    });

    app.listen(3000, () => {
        console.log("Server is running on port 3000");
    });

    for (let i = 0; i < 30; i++) {
        await olegAgent.act();
        await alexAgent.act();
        await mashaAgent.act();
    }
}

main();