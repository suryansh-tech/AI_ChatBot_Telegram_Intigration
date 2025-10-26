import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import userModel from './src/models/user.js';
import eventModel from "./src/models/event.js";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Import DB connection 
import connectDB from "./src/models/config/db.js"; 
connectDB()

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// our bot goes here
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
    const from = ctx.update.message.from;
    try {
        await userModel.findOneAndUpdate(
            { tgId: from.id },
            {
                $setOnInsert: {
                    firstName: from.first_name,
                    lastName: from.last_name,
                    isBot: from.is_bot,
                    username: from.username
                }
            },
            { upsert: true, new: true }
        );

        await ctx.reply(`Hey! ${from.first_name}, Welcome. I will be writing engaging social media posts for you ✨ Just keep feeding me with events throughout the day. Let's shine on social media ⭐`);
    } catch (err) {
        console.log(err);
        await ctx.reply("Facing difficulties! ⛓️‍💥");
    }
});

// Generate command handling using Google Gemini AI
bot.command('generate', async (ctx) => {
    const from = ctx.update.message.from;
    
    // Send loading message
    const { message_id: waitingMessageId } = await ctx.reply(
        `Hey! ${from.first_name}, Kindly wait a moment. I am creating posts for you 🚀`
    );

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Get all the events from DB for today
    const events = await eventModel.find({
        tgId: from.id,
        createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    if (events.length === 0) {
        await ctx.deleteMessage(waitingMessageId);
        await ctx.reply('No events for the day.');
        return;
    }

    // 2. Call Google Gemini AI
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const response = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{
                    text: `Write three engaging social media posts for LinkedIn, Facebook, and Twitter. Use simple and natural language. Focus on engaging the respective platform's audience. Don't mention the time explicitly, just craft impactful and creative posts using these events: ${events.map(event => event.text).join(', ')}`
                }]
            }]
        });

        const aiResponse = response.response.candidates[0]?.content.parts[0]?.text || "Couldn't generate posts.";

        // Send AI response to user
        await ctx.deleteMessage(waitingMessageId);
        await ctx.reply(aiResponse);
    } catch (error) {
        await ctx.deleteMessage(waitingMessageId);
        console.error("❌ Error:", error);
        await ctx.reply("Oops! Something went wrong while generating posts.");
    }
});

// Handling messages
bot.on(message('text'), async (ctx) => {
    const from = ctx.update.message.from;
    const message = ctx.update.message.text;

    try {
        await eventModel.create({ text: message, tgId: from.id });

        await ctx.reply('Noted the message sir! 📩 Keep feeding me with events. Use /generate to shine on social media ⭐');
    } catch (error) {
        ctx.reply('Facing difficulties! ⛓️‍💥');
    }
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

