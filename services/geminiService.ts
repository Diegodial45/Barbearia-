import { GoogleGenAI } from "@google/genai";
import { Booking } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateBookingConfirmation = async (booking: Booking, shopName: string = "BARBEARIA GONÇALVES"): Promise<string> => {
  if (!apiKey) return `Agendamento confirmado para ${booking.serviceName} às ${booking.time}.`;

  try {
    const prompt = `
      Você é um assistente de IA moderno e descolado para uma barbearia chamada "${shopName}".
      Um cliente chamado ${booking.customerName} acabou de agendar um "${booking.serviceName}" para o dia ${booking.date} às ${booking.time}.
      
      Escreva uma mensagem curta e animada de confirmação (máximo 2 frases) para enviar a ele em Português do Brasil.
      Use emojis. Seja estiloso.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Tudo pronto! Nos vemos na cadeira.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Agendamento confirmado! Estamos ansiosos para vê-lo.";
  }
};

export const generateDaySummary = async (bookings: Booking[], shopName: string = "BARBEARIA GONÇALVES"): Promise<string> => {
  if (!apiKey) return "Confira sua agenda abaixo.";

  try {
    const bookingSummaries = bookings.map(b => `${b.time}: ${b.serviceName} com ${b.customerName}`).join('\n');
    const prompt = `
      Você é um assistente de barbeiro na "${shopName}". Aqui está a agenda de hoje:
      ${bookingSummaries}
      
      Dê um resumo motivacional de 1 frase para o barbeiro começar o dia, em Português do Brasil.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Parece um dia cheio. Vamos ao trabalho!";
  } catch (error) {
    return "Aqui está sua agenda para hoje.";
  }
};