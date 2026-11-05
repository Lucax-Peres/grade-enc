# Grade ENC

Controle da grade de **Engenharia da Computação**: fluxograma editável, notas, anotações e previsão de formatura com base nas horas que faltam. Funciona no computador e no celular, e pode ser **instalado como app** (PWA), inclusive abrindo sem internet.

## Estrutura do projeto

```
grade-enc/
├── index.html              # estrutura da página (HTML)
├── assets/
│   ├── style.css           # visual (tema claro/escuro, layout desktop e celular)
│   ├── data.js             # A GRADE: disciplinas, horas, pré-requisitos e situação do PDF
│   └── app.js              # lógica: fluxograma, lista, previsão, edição, salvamento
├── manifest.webmanifest    # dados do app instalável (nome, ícones, cores)
├── sw.js                   # service worker (modo offline)
├── icons/                  # logo.svg (original da logo) e ícones PNG gerados a partir dele
├── vercel.json             # cabeçalhos HTTP para o Vercel
└── .gitignore
```

> Site 100% estático: **não tem build, nem `npm install`**. O Vercel só publica os arquivos.

## 1. Testar no seu computador

O service worker e alguns recursos só funcionam via `http://`, não abrindo o arquivo com duplo clique. Escolha **uma** opção:

```bash
# Opção A — Python (já vem no Linux/macOS; no Windows instale pelo python.org)
cd grade-enc
python -m http.server 5500
# abra http://localhost:5500

# Opção B — Node.js
cd grade-enc
npx serve .
```

Ou no **VS Code**: instale a extensão **Live Server**, clique com o botão direito em `index.html` → *Open with Live Server*.

## 2. Publicar no Vercel

### Opção A (recomendada): GitHub + Vercel, com deploy automático

Todo `git push` publica uma nova versão sozinho.

**2.1. Subir para o GitHub**

1. Crie um repositório vazio em <https://github.com/new> (nome sugerido: `grade-enc`). **Não** marque "Add a README".
2. No terminal, dentro da pasta do projeto:

```bash
cd grade-enc
git init
git add .
git commit -m "Grade ENC: primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/grade-enc.git
git push -u origin main
```

**2.2. Importar no Vercel**

1. Entre em <https://vercel.com> com a sua conta do GitHub.
2. Clique em **Add New… → Project**.
3. Em *Import Git Repository*, escolha `grade-enc` → **Import**.
4. Em **Framework Preset**, deixe **Other**. Não precisa de *Build Command* nem de *Output Directory*.
5. Clique em **Deploy**. Em ~30 s você recebe um link como `https://grade-enc-xxxx.vercel.app`.

**2.3. Atualizar depois**

```bash
git add .
git commit -m "descreva a mudança"
git push
```

### Opção B: Vercel CLI (direto do terminal, sem GitHub)

Precisa do Node.js instalado.

```bash
npm i -g vercel        # instala a CLI
vercel login           # abre o navegador para você entrar na sua conta
cd grade-enc
vercel                 # 1º deploy: responda às perguntas (pode aceitar os padrões)
vercel --prod          # deploys seguintes, direto para o link de produção
```

## 3. Instalar no celular

1. Abra o link do Vercel no celular.
2. **Android (Chrome):** toque em **Instalar app** (aparece na aba Resumo) ou no menu ⋮ → *Instalar app*.
3. **iPhone (Safari):** toque em **Compartilhar** → **Adicionar à Tela de Início**.

O ícone "Grade ENC" aparece na tela inicial e abre em tela cheia, como um app.

## 4. Onde ficam seus dados (importante)

- O site salva tudo no **navegador do aparelho** (`localStorage`). **Celular e computador não sincronizam sozinhos.**
- Para passar os dados de um para o outro: aba **Resumo → Exportar JSON** num aparelho e **Importar JSON** no outro.
- Limpar os dados do navegador apaga suas edições. Exporte um backup de vez em quando.
- Próximo passo para sincronizar de verdade: um backend (ex.: **Supabase** com login). Fica como evolução do projeto.

### Matrículas (SUAP)

A aba **Matrículas** lê suas matérias, horários e salas pela API oficial do SUAP do IFMT, direto do navegador, sem servidor no meio. A senha só é usada no login e não é salva. O token de renovação e os dados ficam em `localStorage` (`grade-enc-suap`), fora do backup em JSON e fora deste repositório. **Desconectar** apaga tudo do aparelho.

**Comparar com a grade** lê o boletim de todos os períodos e propõe mudanças de situação, nota e semestre, que só valem depois da sua aprovação. O alerta de faltas usa o limite do IFMT: 75% de frequência, ou até 25% da carga horária em faltas.

## 5. Como fazer mudanças comuns

| Quero… | Onde mexer |
|---|---|
| Corrigir um pré-requisito ou o nome/horas de uma disciplina | `assets/data.js` |
| Mudar cores ou fontes | `:root` no topo de `assets/style.css` |
| Mudar a regra do plano de semestres | função `computePlan()` em `assets/app.js` |
| Publicar uma mudança e garantir que o celular pegue | aumente `CACHE = "grade-enc-v1"` → `v2` em `sw.js` |

**Por que aumentar a versão do cache?** O service worker guarda os arquivos no celular para o app abrir offline. Se a versão não mudar, o celular pode continuar mostrando a versão antiga por um tempo.

## 6. Como a previsão é calculada

1. **Horas que faltam** = total (3.128 h) − concluídas − cursando.
2. **Mínimo pela carga** = ⌈horas que faltam ÷ carga máxima por semestre⌉.
3. **Mínimo pela cadeia** = maior sequência de disciplinas pendentes ligadas por pré-requisito (caminho crítico do grafo).
4. **Plano**: a cada semestre entram as disciplinas já liberadas, priorizando as que destravam a cadeia mais longa, até o teto de horas. É uma **ordenação topológica com restrição de capacidade**, o mesmo conceito de Matemática Discreta e Teoria dos Grafos.
