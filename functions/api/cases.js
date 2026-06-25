export async function onRequestGet() {
  const cases = [
    "사기",
    "폭행/상해",
    "협박/공갈",
    "명예훼손/모욕",
    "횡령/배임",
    "스토킹/가정폭력",
    "사이버범죄",
    "업무방해/기타",
  ];

  return Response.json({
    cases,
    source: "고소장 도우미 MVP",
  });
}
