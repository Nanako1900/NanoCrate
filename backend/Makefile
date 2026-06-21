SHELL := /bin/bash
GOPATH_BIN := $(shell go env GOPATH)/bin
MIGRATE := $(GOPATH_BIN)/migrate
SQLC := $(GOPATH_BIN)/sqlc
STATICCHECK := $(GOPATH_BIN)/staticcheck
MIGRATIONS_DIR := db/migrations

# 载入 .env(若存在);其变量会 export 给子进程。缺省值兜底,确保命令开箱即用。
-include .env
export

DATABASE_URL ?= postgres://nano:nano@localhost:5432/nanocrate?sslmode=disable

.PHONY: help run worker air build migrate-up migrate-down migrate-new sqlc \
        test test-unit test-int cover lint vet tidy fmt compose-up compose-down

help: ## 显示可用目标
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.env: ## 从样例生成本地 .env(若不存在)
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

run: .env ## 启动 API(默认 :8080)
	go run ./cmd/api

worker: .env ## 启动事件 worker(outbox relay + consumer + sweeper)
	go run ./cmd/worker

air: .env ## 热重载启动(需 air)
	$(GOPATH_BIN)/air

build: ## 编译二进制到 bin/api
	go build -o bin/api ./cmd/api

migrate-up: ## 应用全部迁移
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" up

migrate-down: ## 回滚一步
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" down 1

migrate-new: ## 新建迁移: make migrate-new name=add_xxx
	$(MIGRATE) create -ext sql -dir $(MIGRATIONS_DIR) -seq $(name)

sqlc: ## 由 db/queries 生成类型安全代码(生成代码不手改)
	$(SQLC) generate

test: ## 全部测试(含 testcontainers 集成,需 Docker)
	go test -tags=integration -count=1 ./...

test-unit: ## 仅单元测试(无需 Docker)
	go test -count=1 ./...

test-int: ## 仅集成测试(testcontainers)
	go test -tags=integration -count=1 -run Integration ./...

cover: ## 覆盖率(目标 ≥ 80%,核心结账/库存必覆盖)
	go test -tags=integration -count=1 -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -1

lint: ## staticcheck + go vet
	$(STATICCHECK) ./...
	go vet ./...

vet: ## go vet
	go vet ./...

fmt: ## gofmt
	gofmt -w -s $(shell find . -name '*.go' -not -path './internal/catalog/db/*')

tidy: ## go mod tidy
	go mod tidy

compose-up: ## 起本地依赖(postgres/keycloak/nats)
	docker compose up -d

compose-down: ## 停本地依赖
	docker compose down
