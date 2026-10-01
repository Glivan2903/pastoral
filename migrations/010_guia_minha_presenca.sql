-- Nova guia "Minha presença": amplia a lista permitida em usuario_guias.
ALTER TABLE usuario_guias DROP CONSTRAINT usuario_guias_guia_check;
ALTER TABLE usuario_guias ADD CONSTRAINT usuario_guias_guia_check
  CHECK (guia IN ('minha-presenca', 'frequencia', 'aniversariantes', 'avisos', 'membros', 'financeiro'));

-- @down
DELETE FROM usuario_guias WHERE guia = 'minha-presenca';
ALTER TABLE usuario_guias DROP CONSTRAINT usuario_guias_guia_check;
ALTER TABLE usuario_guias ADD CONSTRAINT usuario_guias_guia_check
  CHECK (guia IN ('frequencia', 'aniversariantes', 'avisos', 'membros', 'financeiro'));
