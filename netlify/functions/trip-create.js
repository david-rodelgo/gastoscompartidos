const { neon } = require("@netlify/neon");

const sql = neon();

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const { id, k, group } = JSON.parse(event.body || "{}");
  if (!id || !k || !group) {
    return { statusCode: 400, body: "Faltan campos (id,k,group)" };
  }

  await sql(
    "insert into trip_groups (id, access_key, data) values ($1,$2,$3::jsonb)",
    [id, k, JSON.stringify(group)]
  );

  return { statusCode: 200, body: "OK" };
};
