-- Personalização da marca (cores e logotipo), editada pelo administrador.
INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES
  ('marca_cor_principal', '#1d3766'),
  ('marca_cor_secundaria', '#c8962c'),
  ('marca_logo', ''),
  ('marca_versao', '0');

-- @down
DELETE FROM configuracoes WHERE chave IN ('marca_cor_principal', 'marca_cor_secundaria', 'marca_logo', 'marca_versao');
