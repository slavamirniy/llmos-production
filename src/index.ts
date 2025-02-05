import { makeGptRequestToolsAsSchema } from "./gpt.js";
import express from "express";
import path from "path";
import { chatBuilder, chats } from "./apps/chat.js";
import { LLMOS } from "./types/os.js";

// сделать рекурсивный strict для tools
// Tool call name is undefined

// аддоны могут
// - менять функции
// - менять поведение по нажатию кнопки

// сделать чтобы при билде можно было сразу указать начальные значения для состояний

async function main() {
    const olgeOS = new LLMOS({
        LLMRequestFunction: makeGptRequestToolsAsSchema,
        apps: {
            chat: chatBuilder.build({allowedChats: ["Алекс", "Маша"], userId: 'Олег'})
        },
        goal: "Ты Олег, ты знаешь что кирман - это такая подкова для лошади. Но ты об этом не рассказываешь Алексу, а Маше можешь рассказать, если спросит. Твоя задача узнать, что такое бибмбук, кто-то из участников знает что это."
    });

    const alexOS = new LLMOS({
        LLMRequestFunction: makeGptRequestToolsAsSchema,
        apps: {
            chat: chatBuilder.build({allowedChats: ["Олег", "Маша"], userId: 'Алекс'})
        },
        goal: "Ты Алекс, ты знаешь что сунтюк - это такая расческа для кошек. Но ты об этом не рассказываешь Маше, а Олегу можешь рассказать, если спросит. Твоя задача узнать, что такое кирман, кто-то из участников знает что это."
    });

    const mashaOS = new LLMOS({
        LLMRequestFunction: makeGptRequestToolsAsSchema,
        apps: {
            chat: chatBuilder.build({allowedChats: ["Олег", "Алекс"], userId: 'Маша'})
        },
        goal: "Ты Маша, ты знаешь что бимбук - это такая палочка для собак. Но ты об этом не рассказываешь Олегу, а Алексу можешь рассказать, если спросит. Твоя задача узнать, что такое сунтюк, кто-то из участников знает что это."
    });
    
    const app = express();

    // Добавляем middleware для статических файлов
    app.use(express.static(path.join(process.cwd(), 'public')));

    app.get("/chats", (req, res) => {
        const chatsWithReasoning = chats.map(chat => ({
            ...chat,
            messages: [
                ...chat.messages
            ]
        }));
        res.json(chatsWithReasoning);
    });

    app.get("/currentWindows", (req, res) => {
        const windows = {
            oleg: olgeOS.getCurrentWindow(),
            alex: alexOS.getCurrentWindow(),
            masha: mashaOS.getCurrentWindow()
        }
        res.json(windows);
    })


    app.listen(3000, () => {
        console.log("Server is running on port 3000");
    });

    for (let i = 0; i < 30; i++) {
        await olgeOS.act();
        await alexOS.act();
        await mashaOS.act();
    }

}

main();