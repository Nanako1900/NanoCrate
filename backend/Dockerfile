# Multi-stage build for the NanoCrate backend. One image carries all binaries
# (api / worker / backfill) plus the migrate CLI and the migration files, so the
# same image serves the API Deployment, the worker Deployment, and a migrate Job
# (the Deployments/Job pick the binary via `command`). Built on distroless static.
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ENV CGO_ENABLED=0
RUN go build -o /out/api ./cmd/api \
 && go build -o /out/worker ./cmd/worker \
 && go build -o /out/backfill ./cmd/backfill \
 && go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/api /out/worker /out/backfill /app/
COPY --from=build /go/bin/migrate /app/migrate
COPY --from=build /src/db/migrations /migrations
USER nonroot:nonroot
EXPOSE 8080 9091
ENTRYPOINT ["/app/api"]
