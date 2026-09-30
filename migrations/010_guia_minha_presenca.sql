-- Nova guia "Minha presença". O SQLite não altera CHECK; recria usuario_guias com a lista ampliada.
CREATE TABLE usuario_guias_nova (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  guia TEXT NOT NULL CHECK (guia IN ('minha-presenca', 'frequencia', 'aniversariantes', 'avisos', 'membros', 'financeiro')),
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
  guia TEXT NOT NULL CHECK (guia IN ('frequencia', 'aniversariantes', 'avisos', 'membros', 'financeiro')),
  liberado INTEGER NOT NULL CHECK (liberado IN (0, 1)),
  atualizado_por INTEGER REFERENCES usuarios (id),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario_id, guia)
);
INSERT INTO usuario_guias_antiga SELECT * FROM usuario_guias WHERE guia <> 'minha-presenca';
DROP TABLE usuario_guias;
ALTER TABLE usuario_guias_antiga RENAME TO usuario_guias;
