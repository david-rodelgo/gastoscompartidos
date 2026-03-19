import type { Handler } from "@netlify/functions";
import { neon } from "@netlify/neon";

const sql = neon(process.env.NETLIFY_DATABASE_URL!);

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "POST only" };
    }

    const body = JSON.parse(event.body || "{}");
    const { id, k, group } = body;

    if (!id || !k || !group) {
      return { statusCode: 400, body: "Faltan campos (id,k,group)" };
    }

    await sql(
      "insert into public.trip_groups (id, access_key, data) values ($1,$2,$3::jsonb)",
      [id, k, JSON.stringify(group)]
    );

    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    return { statusCode: 500, body: `ERROR: ${e?.message || String(e)}` };
  }
};
