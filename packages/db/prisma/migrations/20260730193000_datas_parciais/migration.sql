-- Datas parciais (ADR-028): nascimento e falecimento viram texto, porque metade
-- da árvore de uma família tem só o ano — e `timestamp` obriga a inventar dia e
-- mês. A conversão preserva o que já existe no formato canônico `YYYY-MM-DD`;
-- quem só tem o ano vira `YYYY` num passo à parte (script `db:trim-partial-dates`),
-- não aqui, porque distinguir "1º de janeiro de verdade" de "1º de janeiro
-- inventado" é decisão de quem conhece a família, não da migration.
ALTER TABLE "people"
  ALTER COLUMN "birthDate" TYPE VARCHAR(10)
    USING to_char("birthDate", 'YYYY-MM-DD'),
  ALTER COLUMN "deathDate" TYPE VARCHAR(10)
    USING to_char("deathDate", 'YYYY-MM-DD');
