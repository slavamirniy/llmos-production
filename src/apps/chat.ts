import { AppBuilder } from "../types/builder.js";

export const chats: {
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


export const chatBuilder = AppBuilder
    .start()
    .setState(() => ({
        opennedChatId: undefined as string | undefined,
        userId: undefined as string | undefined,
        reasoning: "" as string,
        lastAction: undefined as string | undefined,
        allowedChats: [] as string[]

    }))
    .setFunctionsSchemasGenerator((v, state) => v
        .add("sendMessage", "Отправка сообщения в чат", {
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
        .add("openChat", "Открытие чата с пользователем", {
            type: "object",
            properties: {
                chatId: {
                    type: "string",
                    enum: state.allowedChats
                },
                notes: {
                    type: "string",
                    description: "Ваши заметки по пути расследования"
                }
            },
            required: ["chatId"]
        })
        .add("openChatList", "Открытие списка чатов", {
            type: "object",
            properties: {
                notes: {
                    type: "string",
                    description: "Ваши заметки по пути расследования"
                }
            },
            required: []
        })
    )
    .setWindowGenerator((state, generateWindow) => {
        const userId = state.userId;
        const additionalMessages = state.reasoning.length > 0 ? [{ content: "Ваш ход размышлений:\n" + state.reasoning, role: "system" }] : [];
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
                    content: message.content,
                    role: "assistant"
                } :
                {
                    content: message.content,
                    role: "user"
                }
            ))


        const allowSendMessage = chat.messages.at(-1)?.sender !== state.userId;

        return {
            messages: [
                ...additionalMessages,
                {
                    content: "У вас открыт чат с " + state.opennedChatId,
                    role: "system"
                },
                ...messages,
                ...(!allowSendMessage ? [{ content: "СИСТЕМНОЕ СООБЩЕНИЕ: Вы не можете отправить сообщение, пока пользователь вам не ответит", role: "system" }] : [])
            ],
            availableFunctions: ["openChatList", ...(allowSendMessage ? ["sendMessage"] : [])] as ("openChatList" | "sendMessage")[]
        };
    })

    .setButtonPressHandler((data) => {
        const currentState = data.state.get();

        currentState.lastAction = data.function.name;

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

        if (data.function.args && data.function.args.notes !== undefined) {
            currentState.reasoning = data.function.args.notes;
        }


        return currentState;
    })
    .setBasePromptGenerator(state =>
        state.opennedChatId !== undefined ?
            "У вас открыт чат с " + state.opennedChatId
            :
            ""
    )

    .setAppDescription("Это приложение для общения с пользователями. Вы можете открыть чат с пользователем, отправить им сообщение и просматривать список доступных пользователей для общения.")
