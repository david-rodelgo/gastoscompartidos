const { neon } = require("@netlify/neon");

// Forzamos a usar la URL que Netlify DB expone en entorno
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "POST only" };
    }

    const { id, k, group } = JSON.parse(event.body || "{}");
    if (!id || !k || !group) {
      return { statusCode: 400, body: "Faltan campos (id,k,group)" };
    }

   await sql(
  "insert into public.trip_groups (id, access_key, data) values ($1,$2,$3::jsonb)",
  [id, k, JSON.stringify(group)]
);


    return { statusCode: 200, body: "OK" };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return { statusCode: 500, body: "ERROR: " + msg };
  }
};
