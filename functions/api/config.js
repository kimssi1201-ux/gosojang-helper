export async function onRequestGet({ env }) {
  return Response.json({
    kakaoJavascriptKey: env.KAKAO_JAVASCRIPT_KEY || "",
  });
}
