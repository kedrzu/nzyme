FROM node:22-alpine
WORKDIR /app

COPY .output ./.output

ENV HOST=0.0.0.0
ENV PORT=3012
ENV NODE_ENV=production
EXPOSE 3012

CMD ["node", ".output/server/index.mjs"]
