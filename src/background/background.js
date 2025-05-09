import browser from "webextension-polyfill";
import log from "loglevel";
import { initSettings, handleSettingsChange, getSettings } from "src/settings/settings";
import { updateLogLevel, overWriteLogLevel } from "src/common/log";
import onInstalledListener from "./onInstalledListener";
import { showMenus, onMenusShownListener, onMenusClickedListener } from "./menus";
import { onCommandListener } from "./keyboardShortcuts";
import onMessageListener from "./onMessageListener";

const logDir = "background/background";

browser.runtime.onInstalled.addListener(onInstalledListener);
browser.commands.onCommand.addListener(onCommandListener);

// 合并消息监听器
// 添加请求去重机制
const pendingRequests = new Map();

browser.runtime.onMessage.addListener((request, sender) => {
  if (request.message === "translate") {
    return (async () => {
      try {
        // 创建请求的唯一标识
        const requestId = `${request.text}-${request.sourceLang || 'auto'}-${request.targetLang}-${request.needPhonetic}-${request.phoneticOnly ? 'phonetic' : 'full'}`;
        
        // 检查是否有相同的请求正在处理中
        if (pendingRequests.has(requestId)) {
          return pendingRequests.get(requestId);
        }
        
        // 创建新的处理Promise
        const resultPromise = (async () => {
          let translationResult = {};
          
          // 如果只需要音标数据，不进行翻译
          if (!request.phoneticOnly) {
            translationResult = await translate(request.text, request.sourceLang, request.targetLang);
          } else {
            translationResult = {
              resultText: "",
              sourceLanguage: request.sourceLang || "auto",
              percentage: 1,
              candidateText: "",
              isError: false
            };
          }
          
          let phonetic = null;
          
          // 判断是否为单词
          const isSingleWord = request.text.trim().split(/\s+/).length === 1;
          
          if ((request.needPhonetic || request.phoneticOnly) && isSingleWord) {
            phonetic = await getPhonetic(request.text.trim());
          }
          
          const result = {
            ...translationResult,
            ...(phonetic || {})
          };
          
          // 请求完成后，从Map中移除
          setTimeout(() => {
            pendingRequests.delete(requestId);
          }, 1000); // 保留1秒，以防快速重复请求
          
          return result;
        })();
        
        // 将Promise存入Map
        pendingRequests.set(requestId, resultPromise);
        
        // 返回Promise结果
        return resultPromise;
      } catch (error) {
        console.error("处理翻译请求时出错:", error);
        return {
          isError: true,
          errorMessage: error.message
        };
      }
    })();
  }
  // 其他消息类型才传递给 onMessageListener
  return onMessageListener(request, sender);
});
browser.storage.local.onChanged.addListener((changes) => {
  handleSettingsChange(changes);
  updateLogLevel();
  showMenus();
});

if (!!browser.contextMenus?.onShown) browser.contextMenus.onShown.addListener(onMenusShownListener);
browser.contextMenus.onClicked.addListener(onMenusClickedListener);

const init = async () => {
  await initSettings();
  overWriteLogLevel();
  updateLogLevel();
  log.info(logDir, "init()");
  showMenus();
};
init();

const getPhonetic = async (text) => {
  try {
    // 从设置中获取 API Key
    const apiKey = getSettings("yandexDictionaryApiKey");
    
    // 如果没有设置 API Key，则直接返回 null
    if (!apiKey) {
      return null;
    }
    
    const url = `https://dictionary.yandex.net/api/v1/dicservice.json/lookup?key=${apiKey}&lang=en-en&text=${encodeURIComponent(text.trim())}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Yandex API 错误响应:", errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || !data.def || data.def.length === 0) {
      return null;
    }

    // 处理 Yandex 词典数据
    const firstEntry = data.def[0];
    const definitions = data.def.map(entry => {
      // 获取所有翻译和同义词
      const allMeanings = entry.tr ? entry.tr.map(tr => {
        const meanings = [tr.text];
        if (tr.syn) {
          meanings.push(...tr.syn.map(s => s.text));
        }
        return meanings;
      }).flat() : [];

      // 获取例句（如果有的话）
      const examples = entry.tr && entry.tr.filter(tr => tr.ex)
        .map(tr => tr.ex.map(ex => ex.text))
        .flat()
        .slice(0, 2);

      return {
        partOfSpeech: entry.pos || '',
        meanings: allMeanings,
        examples: examples || []
      };
    });

    // 收集所有同义词
    const allSynonyms = data.def
      .flatMap(entry => entry.tr || [])
      .filter(tr => tr.syn)
      .flatMap(tr => tr.syn.map(syn => syn.text));

    // 确保ipa是一个字符串
    let ipaString = null;
    if (firstEntry && firstEntry.ts) {
      ipaString = String(firstEntry.ts).trim();
    }
    
    // 使用更可靠的TTS服务
    // 使用Google Text-to-Speech服务
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    
    // 添加备用TTS服务
    // 移除可能的标点符号，确保单词格式正确
    const cleanWord = text.trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
    const backupTtsUrl = `https://api.dictionaryapi.dev/media/pronunciations/en/${encodeURIComponent(cleanWord)}.mp3`;
    
    // 添加Forvo链接
    const forvoUrl = `https://forvo.com/word/${encodeURIComponent(cleanWord)}/`;
    
    // 添加Dictionary.com TTS (更稳定的API)
    const dictTtsUrl = `https://www.dictionary.com/browse/sound/${encodeURIComponent(cleanWord)}`;
    
    // 添加Cambridge Dictionary API (更权威的发音)
    const cambridgeTtsUrl = `https://dictionary.cambridge.org/pronunciation/english/${encodeURIComponent(cleanWord)}`;
    
    const result = {
      ipa: ipaString,
      definitions: definitions.length > 0 ? definitions : null,
      synonyms: allSynonyms.length > 0 ? [...new Set(allSynonyms)].slice(0, 5) : null,
      tts: ttsUrl,
      backupTts: backupTtsUrl,
      forvoUrl: forvoUrl,
      dictTtsUrl: dictTtsUrl,
      cambridgeTtsUrl: cambridgeTtsUrl,
      word: cleanWord // 保存清理后的单词，用于前端构建其他TTS URL
    };

    // 检查至少有一个非空值
    if (!result.ipa && !result.definitions && !result.synonyms) {
      return null;
    }

    return result;
  } catch (error) {
    console.error("获取词典数据时出错:", error);
    return null;
  }
};

// 添加翻译函数
const translate = async (text, sourceLang, targetLang) => {
  try {
    // 使用 Google Translate API
    // 增加dt=bd参数获取单词的词典信息
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    // 提取候选释义（如果有）
    let candidateText = "";
    if (data[1]) { // 词典信息
      candidateText = data[1]
        .map(entry => `${entry[0]}: ${entry[1].join(", ")}`)
        .join("\n");
    }
    
    return {
      resultText: data[0]?.[0]?.[0] || "",
      sourceLanguage: data[2] || sourceLang,
      percentage: 1,
      candidateText: candidateText,
      isError: false
    };
  } catch (error) {
    console.error("翻译出错:", error);
    return {
      isError: true,
      errorMessage: error.message
    };
  }
};
