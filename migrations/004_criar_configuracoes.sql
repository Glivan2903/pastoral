CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT agora()
);

INSERT INTO configuracoes (chave, valor) VALUES
  ('limite_faltas', '3'),
  ('criterio_alerta', 'acumuladas'),   -- acumuladas | consecutivas
  ('mensagem_aniversario', 'Feliz aniversário, {nome}! Que Nossa Senhora Aparecida ilumine seu novo ciclo com fé, saúde e alegria. Receba nosso carinho!');

-- @down
DROP TABLE configuracoes;
