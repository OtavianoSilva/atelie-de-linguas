# Ateliê de Línguas

Gerador procedural de idiomas construídos (*conlangs*) que roda inteiro no navegador. Você escolhe uma **seed** e uma **base numérica**, e o programa produz um idioma completo e reproduzível: cifra baseada em números primos, fonologia com acento, alfabeto próprio (que você pode redesenhar), tradutor bidirecional e uma voz sintetizada do zero.

Sem dependências, sem build, sem servidor. É um único arquivo HTML.

## Índice

- [Recursos](#recursos)
- [Como usar](#como-usar)
- [Como o idioma funciona](#como-o-idioma-funciona)
- [As três abas](#as-três-abas)
- [Arquivo do idioma (.json)](#arquivo-do-idioma-json)
- [Síntese de voz](#síntese-de-voz)
- [Arquitetura do código](#arquitetura-do-código)
- [Usando os módulos como biblioteca](#usando-os-módulos-como-biblioteca)
- [Limites e decisões de projeto](#limites-e-decisões-de-projeto)
- [Persistência e privacidade](#persistência-e-privacidade)

## Recursos

- **Determinístico**: a mesma seed e a mesma base sempre geram o mesmo idioma (primos, fonética, acento e alfabeto inicial).
- **Cifra de primos**: cada letra, número e símbolo recebe um número primo embaralhado pela seed. Uma palavra vira um único número grande que pode ser fatorado de volta.
- **Base numérica configurável** de 2 a 1024. O padrão silábico cresce sozinho conforme a base.
- **Fonologia gerada**: inventário de consoantes e vogais, padrão silábico, consoantes de coda e regra de acento (inicial, penúltima ou final).
- **Alfabeto próprio**: cada dígito ganha um caractere sugerido, e você pode desenhá-lo à mão com o mouse ou o dedo.
- **Tradutor em três direções**: texto → idioma, fonética → texto e dígitos → texto.
- **Escrita em SVG**: o texto traduzido é desenhado com o seu alfabeto e pode ser baixado.
- **Voz própria**: sintetizador de formantes em DSP puro, com quatro vozes, entonação e exportação em `.wav`.
- **Exportar e importar** o idioma completo em JSON.
- **Tema claro e escuro** automático, e layout responsivo para celular.

## Como usar

1. Baixe o arquivo HTML do projeto.
2. Abra no navegador (duplo clique). Não precisa de internet, exceto para carregar as fontes do Google Fonts (há fontes alternativas de sistema como reserva).
3. Na aba **Idioma**, digite uma seed, escolha a base e clique em **Gerar idioma**.
4. Na aba **Alfabeto**, redesenhe os caracteres que quiser.
5. Na aba **Tradutor e voz**, escreva um texto e veja a escrita, a fonética e ouça o resultado.

> Alguns visualizadores embutidos (pré-visualização de editores ou chats) bloqueiam downloads. Se os botões de baixar não funcionarem, abra o arquivo diretamente no navegador.

## Como o idioma funciona

O pipeline completo, do texto ao som:

1. **Primos.** Cada caractere do alfabeto interno (letras minúsculas e maiúsculas, vogais acentuadas, dígitos e símbolos de pontuação) recebe um primo distinto. A ordem é embaralhada pela seed.
2. **Número da palavra.** Uma palavra de caracteres `c₀ c₁ c₂ …` vira o número

   ```
   N = p(c₀)·M⁰ + p(c₁)·M¹ + p(c₂)·M² + …
   ```

   onde `p(c)` é o primo do caractere e `M` é o menor primo maior que todos os primos da tabela. Como todo `p(c) < M`, o número se desfaz sem ambiguidade lendo `N mod M` repetidamente.
3. **Escrita na base.** `N` é convertido para a base escolhida. Cada dígito é, ao mesmo tempo, um caractere do alfabeto e uma unidade sonora.
4. **Sílabas reais.** As unidades sonoras (todas do mesmo padrão, como `CV` ou `CVCVC`) são concatenadas e reagrupadas em sílabas de verdade. A regra de acento da língua marca a sílaba tônica.

### Fonologia

A seed define:

| Elemento | Faixa |
|---|---|
| Consoantes | 8 a 16, sorteadas entre 20 universais |
| Vogais | 3 a 6, sorteadas entre 9 universais |
| Codas | 3 a 6 consoantes que podem fechar sílaba |
| Padrão | `CV`, `CVC`, `CVCV`, `CVCVC` ou `CVCVCV` |
| Acento | inicial (50%), penúltima (30%) ou final (20%) |

O padrão começa num valor sorteado e **sobe** até que o número de sílabas possíveis seja maior ou igual à base. Por isso bases altas geram unidades mais longas.

Inventário universal usado:

- Consoantes: `p b t d k g m n ŋ f v s z ʃ ʒ l r j w h`
- Vogais: `a e i o u æ ɪ ʊ ə`

### Texto exato

Com **Texto exato** ligado, maiúsculas e acentos são letras distintas (“Olá” volta como “Olá”). Desligado, tudo vira minúsculo sem acento, e as palavras ficam mais curtas.

## As três abas

### Idioma

- Campo de **seed** (número ou texto) e **base**, com controle deslizante até 128 e campo numérico até 1024.
- Painel de fonologia com consoantes agrupadas por modo de articulação, vogais, padrão e regra de acento.
- Explicação resumida do funcionamento.
- **Tabela de dígitos**: cada dígito com seu caractere e sua unidade sonora. Clique para editar.
- **Mapa de primos** da seed.

### Alfabeto

- Área de desenho de 100×100 com guias. Traços são simplificados (Ramer–Douglas–Peucker) e suavizados com curvas quadráticas.
- Ações: desfazer traço, limpar, restaurar o padrão, anterior, próximo e **ir ao próximo caractere repetido ou vazio**.
- Espessura da caneta global para todo o alfabeto.
- **Avisos de ambiguidade**: caracteres idênticos ou vazios são marcados com borda tracejada, porque dois dígitos com o mesmo símbolo impedem a leitura de volta da escrita. A fonética e o áudio não são afetados.
- Até a base 64, todos os caracteres sugeridos são únicos. Acima disso, eles se repetem até você desenhar novos.

### Tradutor e voz

Três modos de entrada:

| Modo | Entrada | Saída |
|---|---|---|
| Texto → idioma | texto em português (ou qualquer língua com alfabeto latino) | escrita, fonética e dígitos |
| Fonética → texto | palavras na fonética do idioma | texto decodificado e o restante |
| Dígitos → texto | dígitos da base separados por espaço | texto decodificado e o restante |

Acima da base 62, os dígitos são escritos como números separados por hífen (por exemplo `12-0-45`).

Painéis de saída:

- **Escrita**: SVG com o alfabeto do idioma, com controle de tamanho e botão **Baixar SVG**.
- **Fonética**: pontos separam sílabas, `ˈ` marca a tônica. Pontuação vira pausa na fala.
- **Número em base N**: os dígitos de cada palavra.
- **Anatomia das palavras**: tabela com palavra, número grande, dígitos e fonética (até 60 itens).

Caracteres sem equivalente (emojis, símbolos fora da tabela) são ignorados, e a interface avisa quantos.

## Arquivo do idioma (.json)

O botão **Arquivo do idioma** exporta e importa tudo:

```json
{
  "format": "procedural-conlang",
  "version": 2,
  "name": "Fazedor de biz",
  "seed": "fazedor de biz",
  "base": 26,
  "primes": { "a": 53, "b": 7 },
  "multiplier": 241,
  "options": { "exact": true },
  "phonology": {
    "consonants": [],
    "vowels": [],
    "codas": [],
    "pattern": "CVC",
    "syllables": [],
    "stress": "penult"
  },
  "glyphs": [],
  "style": { "stroke": 5 },
  "voice": { "id": "aria" }
}
```

*(Valores abreviados; o arquivo real tem todos os campos preenchidos.)*

Ao importar, o arquivo é **validado**: formato, base de 2 a 1024, primos realmente primos e únicos, multiplicador maior que todos eles, fonemas dentro do inventário universal, sílabas únicas e no padrão, e glifos saneados (pontos limitados à área do desenho). Arquivos inválidos são recusados com mensagem de erro.

Os caracteres que você desenhou são preservados quando você regenera o idioma com a **mesma seed**, mesmo que a base diminua e depois aumente.

## Síntese de voz

O áudio é gerado por um sintetizador de formantes escrito em JavaScript puro, no estilo Klatt. Ele **não usa a Web Audio API para sintetizar**: calcula as amostras diretamente e só usa o `AudioContext` para tocá-las. Resultado: a mesma entrada produz exatamente as mesmas amostras em qualquer aparelho.

Cadeia de síntese:

- Fonte glótica contínua (ou dente de serra na voz robótica)
- Cascata de ressonadores F1 a F5
- Anti-ressonador nasal
- Ramo de ruído filtrado para fricção, soltura de oclusivas e aspiração
- Contorno de tom com queda no fim das frases, subida nas perguntas, realce nas sílabas tônicas e microvariação

Detalhes de comportamento:

- Vírgulas, pontos e quebras de linha viram pausas.
- Símbolos fora da pontuação básica não são pronunciados.
- Áudio limitado a 90 segundos, taxa de 22 050 Hz, 16 bits mono.
- Controle de velocidade de 0,6× a 1,5×.

| Voz | Característica |
|---|---|
| Aria | aguda e suave |
| Bruno | grave |
| Pip | infantil |
| Autômato | robótica, tom plano |

Também é possível escolher uma **voz do navegador** (Web Speech API). Nesse caso a pronúncia é aproximada por uma regravação ortográfica simples, e não é possível exportar `.wav`.

## Arquitetura do código

O projeto tem três partes, todas incluídas no HTML:

```
.
├── index.html     # interface (HTML + CSS + controlador da página)
├── engine.js      # motor do idioma (seed, primos, fonologia, glifos, tradução)
└── speech.js      # sintetizador de voz
```

> No HTML único, os três blocos estão embutidos em tags `<script>`. Os arquivos `engine.js` e `speech.js` são os mesmos blocos, separados para uso em Node ou em testes.

### `engine.js` (módulo `Conlang`)

| Área | Funções principais |
|---|---|
| PRNG | `hashStr`, `rng(seed, salt)` (determinístico, com sal por finalidade) |
| Primos | `buildPrimes`, `firstPrimes`, `nextPrime` |
| Fonologia | `buildPhonology`, `syllabify`, `stressIndex`, `formatIPA` |
| Glifos | `defaultGlyphs`, `genGlyph`, `sanitizeGlyph`, `glyphIssues` |
| Idioma | `createLanguage`, `validateLanguage`, `clampBase` |
| Tradução | `tokenize`, `encodeText`, `decodeDigitText`, `decodePhoneticText`, `detokenize` |
| Matemática | `wordToNumber`, `numberToWord`, `toDigits`, `fromDigits` (com `BigInt`) |
| Escrita | `strokePath`, `glyphPath`, `layoutScript`, `scriptSVG` |

O motor usa canais de sorteio independentes (`primes2`, `phonology`, `syllables:<padrão>`, `stress`, `glyph:<i>:<tentativa>`, `jitter`, `noise`). Mudar a base não altera a tabela de primos nem o acento.

### `speech.js` (módulo `Speech`)

Exporta `VOICES`, `SR`, `G`, `DUR`, `plan`, `synthesize` e `wavBytes`. O fluxo é: `plan` (tempos, acentos e frases) → `buildTracks` (trilhas de parâmetros) → `buildF0` (contorno de tom) → `render` (amostra a amostra).

### Interface

Controlador em IIFE que liga os campos às funções do motor, desenha as grades (somente a aba visível), gerencia o editor de glifos com Pointer Events, e cuida de áudio, downloads, toasts e do diálogo de arquivo.

## Usando os módulos como biblioteca

Ambos os módulos funcionam no navegador (globais `Conlang` e `Speech`) e em Node (`module.exports`).

```js
const Conlang = require('./engine.js');
const Speech  = require('./speech.js');
const fs      = require('fs');

// 1. Criar o idioma
const lang = Conlang.createLanguage('minha seed', 32, { name: 'Meu idioma' });

// 2. Traduzir um texto
const { words } = Conlang.encodeText(lang, 'Olá, mundo!');
console.log(words.map(w => w.ipa).join(' '));

// 3. Voltar do número para o texto
const back = Conlang.decodeDigitText(lang, words[0].digitStr);
console.log(back.text);

// 4. Gerar o áudio e salvar em .wav
const out = Speech.synthesize(words, 'aria', { seed: lang.seed, rate: 1 });
fs.writeFileSync('saida.wav', Speech.wavBytes(out.samples, out.sr));

// 5. Gerar a escrita em SVG
const svg = Conlang.scriptSVG(lang, words, 56, 800, '#111');
fs.writeFileSync('saida.svg', svg);
```

## Limites e decisões de projeto

- **Base de 2 a 1024.** O teto é só de desempenho da interface; a cifra em si não tem limite.
- **Alfabeto interno fixo.** Letras latinas (maiúsculas e minúsculas), vogais acentuadas comuns do português, dígitos e 28 símbolos de pontuação. Outros sistemas de escrita são ignorados.
- **Glifos únicos só até 64.** A partir do dígito 64 os caracteres sugeridos repetem os anteriores, e a interface avisa até você redesenhar.
- **Nomes de arquivo** exportados têm caracteres não alfanuméricos trocados por `_`.
- **Texto longo.** A tabela de anatomia mostra até 60 itens e o áudio é cortado em 90 segundos.
- **Fonética não é IPA rigorosa.** Usa símbolos IPA, mas a pronúncia sintetizada é uma aproximação e não pretende ser fiel a nenhuma língua natural.

## Persistência e privacidade

Tudo roda localmente. O único acesso externo é o carregamento das fontes do Google Fonts. O idioma atual é salvo no `localStorage` do navegador (chave `ateliê-de-linguas-v2`) a cada alteração e restaurado ao abrir a página. Se o armazenamento estiver bloqueado, o programa continua funcionando, só sem persistência. Para guardar um idioma com segurança, exporte o `.json`.
