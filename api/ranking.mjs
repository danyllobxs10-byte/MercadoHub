// Função da Vercel: reaproveita a mesma lógica usada no Netlify.
import handler from "../netlify/functions/ranking.mjs";
export const GET = (request) => handler(request);
export const maxDuration = 30;
