# 고소장 도우미 작업 안내

## 프로젝트 실행 방법

- 개발 서버 실행: `npm run dev`
- Cloudflare Pages 로컬 실행: `npm start`
- 운영 배포: `npm run deploy`

## 테스트 실행 방법

- 전체 테스트: `npm test`
- 기본 파일 검사: `npm run check`
- 수정 후 통합 검증: `npm run verify`

## 빌드 및 린트 명령어

- 별도 빌드 단계는 없습니다. 정적 파일과 Cloudflare Pages Functions로 동작합니다.
- 별도 린트 도구는 없습니다.
- 문법 및 필수 파일 검사는 `npm run check`와 `npm test`로 수행합니다.

## 코드 수정 후 반드시 실행해야 할 검증 명령어

1. `npm run check`
2. `npm test`
3. `npm run verify`

외부 API가 필요한 테스트는 실제 서비스를 호출하지 말고 mock 응답을 사용합니다.
