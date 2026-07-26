# Kindred – Spec #001: Setup inicial + CRUD de Pessoas

## Contexto

Estamos construindo o **Kindred**, uma aplicação para cadastro de pessoas e seus relacionamentos.
Esta spec cobre o setup completo dos dois projetos e o CRUD inicial de pessoas.

---

## Projetos a criar

| Projeto | Stack | Caminho |
|---|---|---|
| `kindred-api` | NestJS + Prisma + PostgreSQL | `~/projects/personal/kindred/kindred-api` |
| `kindred-web` | React + Vite + TypeScript | `~/projects/personal/kindred/kindred-web` |

---

## 1. kindred-api (NestJS + Prisma)

### 1.1 Estrutura de pastas esperada

```
kindred-api/
├── docker-compose.yml
├── .env
├── .env.example
├── .gitignore
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    └── people/
        ├── people.module.ts
        ├── people.controller.ts
        ├── people.service.ts
        └── dto/
            ├── create-person.dto.ts
            └── update-person.dto.ts
```

### 1.2 Inicialização

Usar o Nest CLI para criar o projeto:

```bash
cd ~/projects/personal/kindred
npx @nestjs/cli new kindred-api --package-manager npm --skip-git
```

### 1.3 Dependências adicionais

```bash
cd kindred-api
npm install @nestjs/config @prisma/client @nestjs/mapped-types class-validator class-transformer
npm install -D prisma
```

### 1.4 docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: kindred-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: kindred
      POSTGRES_PASSWORD: kindred123
      POSTGRES_DB: kindred
    ports:
      - '5432:5432'
    volumes:
      - kindred_pgdata:/var/lib/postgresql/data

volumes:
  kindred_pgdata:
```

### 1.5 .env

```
DATABASE_URL="postgresql://kindred:kindred123@localhost:5432/kindred?schema=public"
PORT=3000
```

### 1.6 .env.example

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/kindred?schema=public"
PORT=3000
```

### 1.7 prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Person {
  id               String           @id @default(uuid())
  name             String
  birthDate        DateTime?
  profilePhoto     String?
  relationshipType RelationshipType
  kinshipDegree    String?
  friendshipOrigin String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@map("people")
}

enum RelationshipType {
  FAMILY
  FRIEND
  ACQUAINTANCE
  OTHER
}
```

### 1.8 src/main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Kindred API rodando em http://localhost:${port}/api`);
}
bootstrap();
```

### 1.9 src/app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PeopleModule } from './people/people.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PeopleModule,
  ],
})
export class AppModule {}
```

### 1.10 src/prisma/prisma.module.ts

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 1.11 src/prisma/prisma.service.ts

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### 1.12 src/people/dto/create-person.dto.ts

```typescript
import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';

export enum RelationshipType {
  FAMILY = 'FAMILY',
  FRIEND = 'FRIEND',
  ACQUAINTANCE = 'ACQUAINTANCE',
  OTHER = 'OTHER',
}

export class CreatePersonDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @IsEnum(RelationshipType)
  relationshipType: RelationshipType;

  @IsOptional()
  @IsString()
  kinshipDegree?: string;

  @IsOptional()
  @IsString()
  friendshipOrigin?: string;
}
```

### 1.13 src/people/dto/update-person.dto.ts

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreatePersonDto } from './create-person.dto';

export class UpdatePersonDto extends PartialType(CreatePersonDto) {}
```

### 1.14 src/people/people.service.ts

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto) {
    return this.prisma.person.create({
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : null },
    });
  }

  async findAll() {
    return this.prisma.person.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException(`Pessoa "${id}" não encontrada`);
    return person;
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.findOne(id);
    return this.prisma.person.update({
      where: { id },
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.person.delete({ where: { id } });
  }
}
```

### 1.15 src/people/people.controller.ts

```typescript
import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.peopleService.create(dto);
  }

  @Get()
  findAll() {
    return this.peopleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.peopleService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.peopleService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.peopleService.remove(id);
  }
}
```

### 1.16 src/people/people.module.ts

```typescript
import { Module } from '@nestjs/common';
import { PeopleService } from './people.service';
import { PeopleController } from './people.controller';

@Module({
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
```

### 1.17 Scripts adicionais no package.json

Garantir que os scripts abaixo existam em `package.json`:

```json
"prisma:generate": "prisma generate",
"prisma:migrate": "prisma migrate dev --name init",
"prisma:studio": "prisma studio"
```

---

## 2. kindred-web (React + Vite)

### 2.1 Inicialização

```bash
cd ~/projects/personal/kindred
npm create vite@latest kindred-web -- --template react-ts
cd kindred-web
npm install
npm install axios react-router-dom
npm install -D @types/react-router-dom
```

### 2.2 Estrutura de pastas esperada

```
kindred-web/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types/
    │   └── person.ts
    ├── api/
    │   └── people.ts
    └── pages/
        ├── PeopleListPage.tsx
        └── PersonFormPage.tsx
```

### 2.3 vite.config.ts

Configurar proxy para a API:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

### 2.4 src/types/person.ts

```typescript
export type RelationshipType = 'FAMILY' | 'FRIEND' | 'ACQUAINTANCE' | 'OTHER';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  FAMILY: 'Família',
  FRIEND: 'Amigo(a)',
  ACQUAINTANCE: 'Conhecido(a)',
  OTHER: 'Outro',
};

export interface Person {
  id: string;
  name: string;
  birthDate?: string | null;
  profilePhoto?: string | null;
  relationshipType: RelationshipType;
  kinshipDegree?: string | null;
  friendshipOrigin?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonFormData {
  name: string;
  birthDate?: string;
  profilePhoto?: string;
  relationshipType: RelationshipType;
  kinshipDegree?: string;
  friendshipOrigin?: string;
}
```

### 2.5 src/api/people.ts

```typescript
import axios from 'axios';
import { Person, PersonFormData } from '../types/person';

const api = axios.create({ baseURL: '/api' });

export const peopleApi = {
  getAll: () => api.get<Person[]>('/people').then((r) => r.data),
  getOne: (id: string) => api.get<Person>(`/people/${id}`).then((r) => r.data),
  create: (data: PersonFormData) =>
    api.post<Person>('/people', data).then((r) => r.data),
  update: (id: string, data: Partial<PersonFormData>) =>
    api.patch<Person>(`/people/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/people/${id}`),
};
```

### 2.6 src/main.tsx

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

### 2.7 src/App.tsx

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import PeopleListPage from './pages/PeopleListPage';
import PersonFormPage from './pages/PersonFormPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/people" replace />} />
      <Route path="/people" element={<PeopleListPage />} />
      <Route path="/people/new" element={<PersonFormPage />} />
      <Route path="/people/:id/edit" element={<PersonFormPage />} />
    </Routes>
  );
}
```

### 2.8 src/index.css

CSS global limpo e funcional, sem frameworks. Definir estilos para:
- Reset básico (`*, box-sizing, margin, padding`)
- `body`: fonte system-ui, fundo `#f5f5f5`
- Classes utilitárias: `.page`, `.page-header`, `.card`, `.form-group`
- Botões: `.btn-primary` (indigo `#6366f1`), `.btn-danger` (red `#ef4444`), `.btn-ghost` (transparente com borda)
- Badges por tipo: `.badge-FAMILY` (amarelo), `.badge-FRIEND` (azul), `.badge-ACQUAINTANCE` (verde), `.badge-OTHER` (cinza)
- `.avatar`: círculo 48px com inicial do nome em indigo quando sem foto

### 2.9 src/pages/PeopleListPage.tsx

Página principal com lista de pessoas. Deve:
- Buscar `GET /api/people` ao montar
- Exibir cada pessoa em um `.card` com: avatar (foto ou iniciais), nome, badge do tipo de relacionamento, data de nascimento formatada em pt-BR, grau de parentesco ou origem da amizade
- Botões "Editar" (navega para `/people/:id/edit`) e "Remover" (chama `DELETE` com confirmação)
- Botão "Adicionar pessoa" no header que navega para `/people/new`
- Estado de loading e estado vazio amigável

### 2.10 src/pages/PersonFormPage.tsx

Formulário de criação e edição. Deve:
- Funcionar para criação (`/people/new`) e edição (`/people/:id/edit`)
- Campos: nome (obrigatório), data de nascimento (date input), tipo de relacionamento (select), grau de parentesco (só aparece se FAMILY), origem da amizade (só aparece se não FAMILY), URL da foto de perfil
- Em modo edição: busca `GET /api/people/:id` e preenche o formulário
- Submit chama `POST /api/people` (criação) ou `PATCH /api/people/:id` (edição)
- Botão "Cancelar" volta para `/people`

---

## 3. Checklist de execução para o Claude Code

Execute nesta ordem:

- [ ] Criar `kindred-api` com Nest CLI
- [ ] Instalar dependências da API
- [ ] Criar todos os arquivos da API conforme seções 1.4 a 1.16
- [ ] Adicionar scripts Prisma ao `package.json`
- [ ] Criar `kindred-web` com Vite
- [ ] Instalar dependências do frontend
- [ ] Criar todos os arquivos do frontend conforme seções 2.3 a 2.10
- [ ] Remover arquivos boilerplate desnecessários do Vite (`App.css`, `assets/react.svg`, conteúdo padrão de `App.tsx`)

---

## 4. Como rodar depois do setup

```bash
# Terminal 1 – banco de dados
cd ~/projects/personal/kindred/kindred-api
docker compose up -d

# Terminal 2 – API
cd ~/projects/personal/kindred/kindred-api
npx prisma migrate dev --name init
npm run start:dev

# Terminal 3 – Frontend
cd ~/projects/personal/kindred/kindred-web
npm run dev
```

- API: http://localhost:3000/api/people
- Frontend: http://localhost:5173
