-- Galeria: eventos com fotos. Quem tem a guia vê e baixa; só Coordenação/Administrador edita.
CREATE TABLE eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_evento TEXT NOT NULL,           -- AAAA-MM-DD
  capa_foto_id INTEGER,                -- foto escolhida como capa (senão, a primeira)
  criado_por INTEGER REFERENCES usuarios (id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_eventos_data ON eventos (data_evento);

CREATE TABLE fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
  arquivo TEXT NOT NULL,
  titulo TEXT,
  criado_por INTEGER REFERENCES usuarios (id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fotos_evento ON fotos (evento_id);

-- A lista de guias permitidas em usuario_guias passa a ser validada pela aplicação (mudava a cada guia nova).
CREATE TABLE usuario_guias_nova (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  guia TEXT NOT NULL,
  liberado INTEGER NOT NULL CHECK (liberado IN (0, 1)),
  atualizado_por INTEGER REFERENCES usuarios (id),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario_id, guia)
);
INSERT INTO usuario_guias_nova SELECT * FROM usuario_guias;
DROP TABLE usuario_guias;
ALTER TABLE usuario_guias_nova RENAME TO usuario_guias;

-- @down
CREATE TABLE usuario_guias_antiga (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  guia TEXT NOT NULL CHECK (guia IN ('minha-presenca', 'frequencia', 'aniversariantes', 'avisos', 'membros', 'financeiro')),
  liberado INTEGER NOT NULL CHECK (liberado IN (0, 1)),
  atualizado_por INTEGER REFERENCES usuarios (id),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario_id, guia)
);
INSERT INTO usuario_guias_antiga SELECT * FROM usuario_guias WHERE guia <> 'galeria';
DROP TABLE usuario_guias;
ALTER TABLE usuario_guias_antiga RENAME TO usuario_guias;
DROP TABLE fotos;
DROP TABLE eventos;
