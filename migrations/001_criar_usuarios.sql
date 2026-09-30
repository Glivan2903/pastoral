-- Usuário e membro são a mesma entidade: quem tem e-mail e senha entra no painel.
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT,                       -- somente dígitos (DDD + número)
  data_nascimento TEXT,                -- AAAA-MM-DD
  email TEXT COLLATE NOCASE UNIQUE,
  foto TEXT,
  funcao TEXT NOT NULL DEFAULT 'membro' CHECK (funcao IN ('coordenacao', 'membro')),
  senha_hash TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  consentimento_lgpd_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usuarios_nome ON usuarios (nome COLLATE NOCASE);
CREATE INDEX idx_usuarios_ativo ON usuarios (ativo);

-- @down
DROP TABLE usuarios;
