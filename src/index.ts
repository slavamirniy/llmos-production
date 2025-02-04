import { makeGptRequest } from "./gpt.js";
import express from "express";
import path from "path";
import { App, WindowWithFunctions } from "./types/base.js";
import { chatBuilder } from "./apps/chat.js";

// сделать enum
// сделать чтобы могли писать повторно но не сразу
// приложения при октрытии могут менять базовый промпт
// аддоны могут
// - менять функции
// - менять поведение по нажатию кнопки

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

class ChatAgent {

    private prevWindow: WindowWithFunctions<any> | undefined;

    constructor(private app: App<any, any>, private userId: string, private actAs: string) {
        this.app.state.userId = userId;
        this.app.state.allowedChats = chats
            .filter(v => v.members.includes(userId))
            .map(v => v.members.find(member => member !== userId)!)
            .flat();
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
            // console.log(err);
        }
    }

}

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