# 고소장 도우미

AI가 사건 내용을 정리해 형사 고소장 초안 작성을 도와주는 Cloudflare Pages 웹앱 MVP입니다.

## 구성

- `public/`: 정적 웹앱
- `functions/api/draft.js`: OpenAI Responses API를 호출하는 Cloudflare Pages Function
- `functions/api/cases.js`: 범죄유형, 질문, 판례 검색 키워드 데이터

## 로컬 실행

```powershell
npm install
npm run dev
```

OpenAI API를 사용하려면 Cloudflare 환경변수 또는 로컬 개발 환경에 `OPENAI_API_KEY`를 설정하세요.

```powershell
$env:OPENAI_API_KEY="sk-..."
npm run dev
```

API 키가 없으면 앱은 서버 AI 호출 없이 브라우저 내 템플릿 초안을 생성합니다.

## Cloudflare 배포

1. GitHub에 새 저장소를 만들고 이 폴더를 푸시합니다.
2. Cloudflare Pages에서 GitHub 저장소를 연결합니다.
3. Build command는 비워두거나 `npm run check`, Output directory는 `public`로 설정합니다.
4. Cloudflare Pages 환경변수에 `OPENAI_API_KEY`를 등록합니다.
5. 필요하면 `OPENAI_MODEL`을 계정에서 사용 가능한 모델명으로 바꿉니다.

Cloudflare Pages에서 GitHub 연결을 쓰면 별도 빌드가 필요 없습니다.

```text
Build command: npm run check
Build output directory: public
Root directory: 비워두기
```

## 주의

이 서비스는 법률 자문이 아니라 문서 초안 작성 보조 도구입니다. 실제 제출 전 변호사 또는 수사기관 상담을 권장한다는 안내를 앱 안에 표시합니다.
