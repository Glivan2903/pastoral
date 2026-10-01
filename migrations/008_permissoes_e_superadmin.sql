-- Usuário mestre: só ele configura quem enxerga o quê. Não participa da chamada nem da lista de membros.
ALTER TABLE usuarios ADD COLUMN superadmin INTEGER NOT NULL DEFAULT 0 CHECK (superadmin IN (0, 1));

-- Exceções por pessoa ao padrão da função. Sem linha = vale o padrão (Coordenação ou Membro).
CREATE TABLE usuario_guias (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  guia TEXT NOT NULL CHECK (guia IN ('frequencia', 'aniversariantes', 'avisos', 'membros', 'financeiro')),
  liberado INTEGER NOT NULL CHECK (liberado IN (0, 1)),
  atualizado_por INTEGER REFERENCES usuarios (id),
  atualizado_em TEXT NOT NULL DEFAULT agora(),
  PRIMARY KEY (usuario_id, guia)
);

-- @down
DROP TABLE usuario_guias;
ALTER TABLE usuarios DROP COLUMN superadmin;
