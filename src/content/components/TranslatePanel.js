import browser from "webextension-polyfill";
import React, { Component } from "react";
import ReactDOM from "react-dom";
import { getSettings } from "src/settings/settings";
import "../styles/TranslatePanel.scss";
import { getBackgroundColor, getCandidateFontColor, getResultFontColor } from "../../settings/defaultColors";

const splitLine = text => {
  const regex = /(\n)/g;
  return text.split(regex).map((line, i) => (line.match(regex) ? <br key={i} /> : line));
};

export default class TranslatePanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      panelPosition: { x: 0, y: 0 },
      panelWidth: 0,
      panelHeight: 0,
      shouldResize: true,
      isOverflow: false,
      isLoadingDict: false,
      isDictExpanded: false,
      dictData: null,
      audio: null,
      isDictDataAvailable: false,
      isPlayingAudio: false,
      audioError: false,
      showPhonetic: true,
      isLoadingPhonetic: false,
      hasLoadedPhonetic: false
    };

    this.dragOffsets = { x: 0, y: 0 };
    this.isDragging = false;
    
    // 保存引用，防止意外触发
    this.originalHidePanel = props.hidePanel;
    this.isProcessingClick = false;
  }

  componentDidMount = () => {
    document.addEventListener("dragstart", this.handleDragStart);
    document.addEventListener("dragover", this.handleDragOver);
    document.addEventListener("drop", this.handleDrop);
    
    // 初始时设置shouldResize，确保组件加载后会调整大小
    this.setState({ shouldResize: true });
    
    // 添加窗口大小变化监听
    window.addEventListener("resize", this.handleWindowResize);
    
    // 添加全局点击事件监听，防止点击事件冒泡触发关闭面板
    document.addEventListener("click", this.handleOutsideClick);
  };

  componentWillUnmount = () => {
    document.removeEventListener("dragstart", this.handleDragStart);
    document.removeEventListener("dragover", this.handleDragOver);
    document.removeEventListener("drop", this.handleDrop);
    window.removeEventListener("resize", this.handleWindowResize);
    
    // 移除全局点击监听
    document.removeEventListener("click", this.handleOutsideClick);
    
    // 清理音频相关资源
    if (this.state.audio) {
      this.state.audio.pause();
    }
    
    if (this.audioTimeout) {
      clearTimeout(this.audioTimeout);
    }
  };

  handleDragStart = e => {
    if (e.target.className !== "simple-translate-move") return;
    this.isDragging = true;

    const rect = document.querySelector(".simple-translate-panel").getBoundingClientRect();
    this.dragOffsets = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    e.dataTransfer.setData("text/plain", "");
  };

  handleDragOver = e => {
    if (!this.isDragging) return;
    e.preventDefault();
    const panel = document.querySelector(".simple-translate-panel");
    panel.style.top = `${e.clientY - this.dragOffsets.y}px`;
    panel.style.left = `${e.clientX - this.dragOffsets.x}px`;
  };

  handleDrop = e => {
    if (!this.isDragging) return;
    e.preventDefault();
    this.isDragging = false;

    const panel = document.querySelector(".simple-translate-panel");
    panel.style.top = `${e.clientY - this.dragOffsets.y}px`;
    panel.style.left = `${e.clientX - this.dragOffsets.x}px`;
  };

  handleWindowResize = () => {
    // 窗口大小变化时触发面板大小重新计算
    this.setState({ shouldResize: true });
  };

  calcPosition = () => {
    const maxWidth = parseInt(getSettings("width"));
    const maxHeight = parseInt(getSettings("height"));
    const wrapper = ReactDOM.findDOMNode(this.refs.wrapper);
    const panelWidth = Math.min(wrapper.clientWidth, maxWidth);
    const panelHeight = Math.min(wrapper.clientHeight, maxHeight);
    const windowWidth = document.documentElement.clientWidth;
    const windowHeight = document.documentElement.clientHeight;
    const referencePosition = this.props.position;
    const offset = parseInt(getSettings("panelOffset"));

    let position = { x: 0, y: 0 };
    const panelDirection = getSettings("panelDirection");
    switch (panelDirection) {
      case "top":
        position.x = referencePosition.x - panelWidth / 2;
        position.y = referencePosition.y - panelHeight - offset;
        break;
      case "bottom":
        position.x = referencePosition.x - panelWidth / 2;
        position.y = referencePosition.y + offset;
        break;
      case "right":
        position.x = referencePosition.x + offset;
        position.y = referencePosition.y - panelHeight / 2;
        break;
      case "left":
        position.x = referencePosition.x - panelWidth - offset;
        position.y = referencePosition.y - panelHeight / 2;
        break;
      case "topRight":
        position.x = referencePosition.x + offset;
        position.y = referencePosition.y - panelHeight - offset;
        break;
      case "topLeft":
        position.x = referencePosition.x - panelWidth - offset;
        position.y = referencePosition.y - panelHeight - offset;
        break;
      case "bottomRight":
        position.x = referencePosition.x + offset;
        position.y = referencePosition.y + offset;
        break;
      case "bottomLeft":
        position.x = referencePosition.x - panelWidth - offset;
        position.y = referencePosition.y + offset;
        break;
    }

    if (position.x + panelWidth > windowWidth - offset) {
      position.x = windowWidth - panelWidth - offset;
    }
    if (position.y + panelHeight > windowHeight - offset) {
      position.y = windowHeight - panelHeight - offset;
    }
    if (position.x < 0 + offset) {
      position.x = offset;
    }
    if (position.y < 0 + offset) {
      position.y = offset;
    }
    return position;
  };

  calcSize = () => {
    const maxWidth = parseInt(getSettings("width"));
    const maxHeight = parseInt(getSettings("height"));
    const wrapper = ReactDOM.findDOMNode(this.refs.wrapper);
    
    // 设置一个最小宽度，确保音标区域有足够空间
    const minPanelWidth = 200; // 设置最小宽度为200px
    const wrapperWidth = wrapper.clientWidth < maxWidth ? Math.max(wrapper.clientWidth + 1, minPanelWidth) : maxWidth;
    
    // 计算内容高度
    const content = ReactDOM.findDOMNode(this.refs.wrapper).querySelector('.simple-translate-result-contents');
    const contentHeight = content ? content.scrollHeight : 0;
    
    // 如果有词典数据且已展开，考虑词典内容的高度
    let dictionaryHeight = 0;
    const dictionary = content?.querySelector('.simple-translate-dictionary');
    if (dictionary && this.state.isDictExpanded) {
      dictionaryHeight = dictionary.scrollHeight;
      console.debug("词典高度:", dictionaryHeight);
    }
    
    // 调整最大高度，考虑词典内容
    let adaptedMaxHeight = maxHeight;
    if (dictionaryHeight > 0) {
      // 为词典内容提供更多空间，但不超过屏幕高度的70%
      const screenHeight = window.innerHeight;
      adaptedMaxHeight = Math.min(contentHeight + dictionaryHeight, screenHeight * 0.7);
    }
    
    // 如果内容高度超过调整后的最大高度，启用滚动
    const isOverflow = contentHeight > adaptedMaxHeight;
    const wrapperHeight = isOverflow ? adaptedMaxHeight : contentHeight;
    
    console.debug("计算面板大小:", {
      contentHeight,
      dictionaryHeight,
      maxHeight,
      adaptedMaxHeight,
      isOverflow,
      wrapperHeight,
      wrapperWidth,
      screenHeight: window.innerHeight
    });
    
    return { 
      panelWidth: wrapperWidth, 
      panelHeight: wrapperHeight,
      isOverflow: isOverflow
    };
  };

  componentWillReceiveProps = nextProps => {
    const isChangedContents =
      this.props.resultText !== nextProps.resultText ||
      this.props.candidateText !== nextProps.candidateText;
      
    const isChangedPosition = this.props.position !== nextProps.position;

    // 内容变化时仅触发大小重新计算，位置变化时才重新计算位置
    if (isChangedContents && nextProps.shouldShow) {
      this.setState({ shouldResize: true });
    }
    
    // 只有位置变化时才重新计算位置
    if (isChangedPosition && nextProps.shouldShow) {
      const panelPosition = this.calcPosition();
      this.setState({ 
        panelPosition: panelPosition,
        shouldResize: true
      });
    }
  };

  componentDidUpdate(prevProps, prevState) {
    // 保存 prevProps 用于调试
    this.prevProps = prevProps;
    
    // 处理面板大小调整
    if (this.state.shouldResize && this.props.shouldShow) {
      // 只重新计算大小，不重新计算位置
      const { panelWidth, panelHeight, isOverflow } = this.calcSize();

      this.setState({
        shouldResize: false,
        panelWidth: panelWidth,
        panelHeight: panelHeight,
        isOverflow: isOverflow
        // 不更新panelPosition，保持面板位置
      });
    }

    // 处理传入的shouldShow变化
    if (!prevProps.shouldShow && this.props.shouldShow) {
      // 面板从隐藏变为显示，这时候需要重新计算位置
      const panelPosition = this.calcPosition();
      const { panelWidth, panelHeight, isOverflow } = this.calcSize();

      this.setState({
        panelPosition: panelPosition,
        panelWidth: panelWidth,
        panelHeight: panelHeight,
        isOverflow: isOverflow,
        shouldResize: false,
        // 重置音标和词典状态
        hasLoadedPhonetic: false,
        isLoadingPhonetic: false,
        dictData: null,
        isDictDataAvailable: false,
        isDictExpanded: false
      });
    }

    // 处理词典展开状态变化
    if (prevState.isDictExpanded !== this.state.isDictExpanded) {
      this.setState({ shouldResize: true });
    }

    // 处理词典数据可用性变化
    if ((prevState.isDictDataAvailable !== this.state.isDictDataAvailable) || 
        (prevState.dictData !== this.state.dictData && this.state.dictData !== null)) {
      console.debug("词典数据变化，将重新计算大小");
      this.setState({ shouldResize: true });
    }

    // 处理传入的dictData变化
    if (this.props.dictData !== prevProps.dictData) {
      console.debug("传入词典数据发生变化", {
        prev: prevProps.dictData,
        current: this.props.dictData
      });
      
      if (this.props.dictData) {
        // 验证数据是否有效
        const hasValidData = 
          (this.props.dictData.ipa && typeof this.props.dictData.ipa === 'string') || 
          (this.props.dictData.definitions && Array.isArray(this.props.dictData.definitions) && this.props.dictData.definitions.length > 0) ||
          (this.props.dictData.synonyms && Array.isArray(this.props.dictData.synonyms) && this.props.dictData.synonyms.length > 0);
        
        // 注意：不自动展开，只更新数据
        this.setState({
          dictData: this.props.dictData,
          isLoadingDict: false,
          isDictDataAvailable: hasValidData,
          shouldResize: true // 触发重新计算大小，但在shouldResize处理器中不会改变位置
        });
      }
    }

    // 移除自动加载音标的逻辑，只在点击时加载
  }

  loadDictData = async () => {
    console.debug("loadDictData 被调用");
    if (this.state.isLoadingDict) {
      console.debug("正在加载中，跳过");
      return;
    }

    console.debug("开始加载词典数据，当前状态:", {
      isLoadingDict: this.state.isLoadingDict,
      selectedText: this.props.selectedText
    });
    
    this.setState({
      isLoadingDict: true,
      dictData: null
    });

    try {
      // 检查是否已经有词典数据
      if (this.props.dictData) {
        console.debug("使用已有的词典数据");
        this.setState({
          dictData: this.props.dictData,
          isLoadingDict: false,
          isLoadingPhonetic: false,
          hasLoadedPhonetic: true,
          isDictDataAvailable: true,
          isDictExpanded: true // 确保展开状态
        });
        return;
      }

      // 检查是否已经有翻译结果中包含词典数据
      if (this.props.resultText && (typeof this.props.resultText === 'object') && 
         (this.props.resultText.ipa || this.props.resultText.definitions)) {
        console.debug("从翻译结果中提取词典数据");
        const newDictData = {
          ipa: this.props.resultText.ipa,
          definitions: this.props.resultText.definitions,
          synonyms: this.props.resultText.synonyms,
          tts: this.props.resultText.tts,
          word: this.props.selectedText
        };
        console.debug("提取的词典数据:", JSON.stringify(newDictData, null, 2));
        
        // 验证数据是否有效（至少有音标或释义或同义词）
        const hasValidData = 
          (newDictData.ipa && typeof newDictData.ipa === 'string') || 
          (newDictData.definitions && Array.isArray(newDictData.definitions) && newDictData.definitions.length > 0) ||
          (newDictData.synonyms && Array.isArray(newDictData.synonyms) && newDictData.synonyms.length > 0);
        
        this.setState({
          dictData: newDictData,
          isLoadingDict: false,
          isLoadingPhonetic: false,
          hasLoadedPhonetic: true,
          isDictDataAvailable: hasValidData,
          isDictExpanded: true // 确保展开状态
        });
        return;
      }

      // 如果没有已有数据，发送请求获取
      if (this.props.selectedText && this.props.selectedText.trim()) {
        console.debug("发送请求获取词典数据");
        
        // 获取单词
        const word = this.props.selectedText.trim();
        
        try {
          // 发送消息到背景脚本获取词典数据
          const response = await browser.runtime.sendMessage({
            type: "getWordDetails",
            word: word
          });
          
          console.debug("收到词典数据:", response);
          
          if (response && (
              (response.ipa && typeof response.ipa === 'string') || 
              (response.definitions && Array.isArray(response.definitions) && response.definitions.length > 0) ||
              (response.synonyms && Array.isArray(response.synonyms) && response.synonyms.length > 0)
            )) {
            // 添加单词到数据中
            response.word = word;
            
            this.setState({
              dictData: response,
              isLoadingDict: false,
              isLoadingPhonetic: false,
              hasLoadedPhonetic: true,
              isDictDataAvailable: true,
              isDictExpanded: true // 确保展开状态
            });
          } else {
            console.debug("词典数据无效或为空");
            this.setState({
              isLoadingDict: false,
              isLoadingPhonetic: false,
              hasLoadedPhonetic: true,
              isDictDataAvailable: false,
              isDictExpanded: true // 即使没有数据也保持展开状态
            });
          }
        } catch (error) {
          console.error("请求词典数据出错:", error);
          this.setState({
            isLoadingDict: false,
            isLoadingPhonetic: false,
            hasLoadedPhonetic: true,
            isDictDataAvailable: false,
            isDictExpanded: true // 即使出错也保持展开状态
          });
        }
      } else {
        // 无选中文本
        this.setState({
          isLoadingDict: false,
          isLoadingPhonetic: false,
          hasLoadedPhonetic: true,
          isDictDataAvailable: false,
          isDictExpanded: true // 即使没有数据也保持展开状态
        });
      }
    } catch (error) {
      console.error("加载词典数据时出错:", error);
      this.setState({ 
        isLoadingDict: false,
        isLoadingPhonetic: false,
        hasLoadedPhonetic: true,
        isDictDataAvailable: false,
        isDictExpanded: true // 即使出错也保持展开状态
      });
    }
  };

  playTTS = () => {
    if (!this.state.dictData?.tts) return;
    
    this.setState({ isPlayingAudio: true, audioError: false });
    
    try {
      if (this.state.audio) {
        this.state.audio.pause();
      }
      
      // 设置一个较短的超时，因为我们知道可能会失败
      this.audioTimeout = setTimeout(() => {
        if (this.state.isPlayingAudio) {
          console.debug("尝试使用非跨域音频方式");
          this.playAudioUsingHack();
        }
      }, 1500);
      
      // 先尝试主TTS URL
      const audio = new Audio();
      
      // 尝试添加无凭证模式和允许所有来源
      audio.crossOrigin = "anonymous";
      
      audio.onloadeddata = () => {
        audio.play()
          .then(() => {
            console.debug("音频播放成功");
          })
          .catch(error => {
            console.error("主音频播放出错:", error);
            this.playAudioUsingHack();
          });
      };
      
      audio.onended = () => {
        this.setState({ isPlayingAudio: false });
      };
      
      audio.onerror = (error) => {
        console.error("主音频加载出错:", error);
        this.playAudioUsingHack();
      };
      
      // 在设置src之前添加事件处理器
      audio.src = this.state.dictData.tts;
      console.debug("尝试播放主发音:", this.state.dictData.tts);
      
      this.setState({ audio });
    } catch (error) {
      console.error("创建音频对象时出错:", error);
      this.playAudioUsingHack();
    }
  };
  
  // 使用特殊方法尝试播放音频
  playAudioUsingHack = () => {
    // 清除之前的超时
    if (this.audioTimeout) {
      clearTimeout(this.audioTimeout);
    }
    
    // 尝试显示音频界面，因为无法直接播放
    if (!this.state.dictData?.word) {
      this.setState({ isPlayingAudio: false, audioError: true });
      return;
    }
    
    // 轻量级音频方案
    try {
      // 针对简单单词使用更轻量的方案
      const word = this.state.dictData.word.toLowerCase();
      if (word.length < 10 && /^[a-z]+$/.test(word)) {
        // 尝试使用 howjsay.com 的嵌入式音频 (这是一个专门做发音的服务)
        const audioElement = document.createElement('audio');
        document.body.appendChild(audioElement);
        
        // 使用多种TTS格式
        const sources = [
          // 添加多种备用音频源格式
          `https://howjsay.com/mp3/${encodeURIComponent(word)}.mp3`,
          `https://audio.oxforddictionaries.com/en/mp3/${encodeURIComponent(word)}_us_1.mp3`,
          `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(word)}--_us_1.mp3`
        ];
        
        let currentSourceIndex = 0;
        audioElement.onerror = () => {
          currentSourceIndex++;
          if (currentSourceIndex < sources.length) {
            console.debug(`尝试备用音源 ${currentSourceIndex+1}:`, sources[currentSourceIndex]);
            audioElement.src = sources[currentSourceIndex];
            audioElement.load();
          } else {
            console.debug("所有音源都失败，显示网站链接");
            document.body.removeChild(audioElement);
            this.setState({ isPlayingAudio: false, audioError: true });
          }
        };
        
        audioElement.onended = () => {
          document.body.removeChild(audioElement);
          this.setState({ isPlayingAudio: false });
        };
        
        audioElement.onloadeddata = () => {
          audioElement.play()
            .then(() => {
              console.debug("成功播放音频:", sources[currentSourceIndex]);
            })
            .catch(error => {
              console.error("播放失败:", error);
              document.body.removeChild(audioElement);
              this.setState({ isPlayingAudio: false, audioError: true });
            });
        };
        
        console.debug("尝试轻量级音频源:", sources[0]);
        audioElement.src = sources[0];
        audioElement.load();
        
        // 设置超时，以防加载过慢
        this.audioTimeout = setTimeout(() => {
          if (this.state.isPlayingAudio) {
            if (document.body.contains(audioElement)) {
              document.body.removeChild(audioElement);
            }
            this.setState({ isPlayingAudio: false, audioError: true });
          }
        }, 5000);
      } else {
        // 对于复杂单词直接显示错误
        this.setState({ isPlayingAudio: false, audioError: true });
      }
    } catch (error) {
      console.error("轻量级音频方案失败:", error);
      this.setState({ isPlayingAudio: false, audioError: true });
    }
  };
  
  tryBackupTTS = () => {
    // 清除之前的超时
    if (this.audioTimeout) {
      clearTimeout(this.audioTimeout);
    }
    
    // 直接跳到使用hack方法
    this.playAudioUsingHack();
  };
  
  openDictionaryLink = (type) => {
    let url;
    switch(type) {
      case 'forvo':
        url = this.state.dictData?.forvoUrl;
        break;
      case 'dict':
        url = this.state.dictData?.dictTtsUrl;
        break;
      case 'cambridge':
        url = this.state.dictData?.cambridgeTtsUrl;
        break;
      default:
        url = this.state.dictData?.forvoUrl;
    }
    
    if (url) {
      window.open(url, '_blank');
    }
  };

  toggleDictExpand = () => {
    this.setState(prevState => ({
      isDictExpanded: !prevState.isDictExpanded,
      shouldResize: true  // 触发重新计算大小
    }), () => {
      // 状态更新后，立即重新计算大小
      if (this.props.shouldShow) {
        // 使用超时确保DOM已更新
        setTimeout(() => {
          // 只更新大小，保持位置不变
          const { panelWidth, panelHeight, isOverflow } = this.calcSize();
  
          this.setState({
            shouldResize: false,
            panelWidth: panelWidth,
            panelHeight: panelHeight,
            isOverflow: isOverflow
            // 不更新panelPosition，保持面板位置
          });
        }, 50); // 给DOM时间渲染
      }
    });
  };

  // 阻止事件传播到父元素
  preventPropagation = (e) => {
    if (e) {
      e.preventDefault();
      // 安全地调用方法，先检查方法是否存在
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
    }
    return false;
  };

  // 处理外部点击事件
  handleOutsideClick = (e) => {
    // 如果点击事件来自面板内部，则阻止事件冒泡
    const panel = document.querySelector(".simple-translate-panel");
    if (panel && panel.contains(e.target)) {
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
    }
  };

  // 加载音标和发音数据
  loadPhoneticData = (event) => {
    // 设置处理标志
    this.isProcessingClick = true;
    
    // 阻止事件冒泡
    if (event) {
      event.preventDefault();
      // 安全地调用方法
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    }
    
    console.debug("点击加载按钮，获取词典数据");
    
    // 使用更长的延迟避免事件冒泡问题
    setTimeout(() => {
      // 检查面板是否仍处于显示状态
      if (this.props.shouldShow) {
        // 设置加载状态
        this.setState({
          isLoadingPhonetic: true,
          dictData: null,
          isDictDataAvailable: false,
          isDictExpanded: true // 直接设置为展开状态
        });
        
        // 再次延迟调用词典数据加载
        setTimeout(() => {
          // 再次确认面板仍在显示
          if (this.props.shouldShow) {
            this.loadDictData();
          }
          this.isProcessingClick = false;
        }, 150);
      } else {
        this.isProcessingClick = false;
      }
    }, 100);
    
    // 返回false阻止默认行为
    return false;
  };

  render = () => {
    const { shouldShow, selectedText, currentLang, resultText, candidateText, isError, errorMessage } = this.props;
    const { 
      isLoadingDict, isDictExpanded, dictData, isDictDataAvailable, 
      isPlayingAudio, audioError, showPhonetic, isLoadingPhonetic, hasLoadedPhonetic 
    } = this.state;
    
    console.debug("渲染时的状态:", {
      isSingleWord: selectedText ? selectedText.trim().split(/\s+/).length === 1 : false,
      isLoadingDict: this.state.isLoadingDict,
      dictData: this.state.dictData,
      propsDictData: this.props.dictData,
      dictDataExists: Boolean(this.state.dictData),
      hasIpa: this.state.dictData?.ipa,
      ipaType: typeof this.state.dictData?.ipa,
      hasDefinitions: this.state.dictData?.definitions?.length > 0,
      hasSynonyms: this.state.dictData?.synonyms?.length > 0,
      isDictDataRender: Boolean(this.state.dictData && (this.state.dictData.ipa || 
        (this.state.dictData.definitions && this.state.dictData.definitions.length > 0) || 
        (this.state.dictData.synonyms && this.state.dictData.synonyms.length > 0)))
    });
    
    // 判断是否为单词
    const isSingleWord = selectedText.trim().split(/\s+/).length === 1;

    const { width, height } = this.state.shouldResize
      ? { width: parseInt(getSettings("width")), height: parseInt(getSettings("height")) }
      : { width: this.state.panelWidth, height: this.state.panelHeight };

    const panelStyles = {
      width: width,
      height: height,
      top: this.state.panelPosition.y,
      left: this.state.panelPosition.x,
      fontSize: parseInt(getSettings("fontSize")),
      minWidth: '200px' // 为整个面板设置最小宽度
    };

    const backgroundColor = getBackgroundColor();
    if (backgroundColor) {
      panelStyles.backgroundColor = backgroundColor.backgroundColor;
    }

    const wrapperStyles = {
      overflow: this.state.isOverflow ? "auto" : "visible",
      maxHeight: height + "px"
    };

    const translationApi = getSettings("translationApi");

    return (
      <div className={`simple-translate-panel ${shouldShow ? "isShow" : ""}`} ref="panel" style={panelStyles}
          // 添加事件处理程序到根元素，避免冒泡
          onClick={this.preventPropagation}
      >
        <div className="simple-translate-result-wrapper" ref="wrapper" style={wrapperStyles}
            onClick={this.preventPropagation}
        >
          <div className="simple-translate-move" draggable="true" ref="move"></div>
          <div className="simple-translate-result-contents" style={{padding: '5px 20px 20px', overflowWrap: 'break-word'}}
              onClick={this.preventPropagation}
          >
            {/* 翻译结果 - 点击结果加载音标 */}
            <p 
              className="simple-translate-result" 
              style={{
                ...getResultFontColor(), 
                margin: '0 0 10px 0',
                cursor: isSingleWord ? 'pointer' : 'default'
              }} 
              dir="auto"
              onClick={(e) => {
                this.preventPropagation(e);
                if (isSingleWord && !isLoadingPhonetic) {
                  this.loadPhoneticData(e);
                }
              }}
              title={isSingleWord ? "点击显示音标和发音" : ""}
            >
              {splitLine(resultText)}
              {isSingleWord && !isLoadingPhonetic && (
                <span 
                  style={{
                    fontSize: '0.8em',
                    color: '#2196F3',
                    marginLeft: '5px',
                    fontStyle: 'italic'
                  }}
                >
                  (♪)
                </span>
              )}
            </p>
            <p className="simple-translate-candidate" style={{...getCandidateFontColor(), margin: '0'}} dir="auto"
                onClick={this.preventPropagation}
            >
              {splitLine(candidateText)}
            </p>

            {/* 字典内容 - 只在是单词时显示 */}
            {isSingleWord && (
              <>
                {/* 音标和发音内容 - 仅在hasLoadedPhonetic为true时显示 */}
                {hasLoadedPhonetic && (
                  <div className="simple-translate-dictionary" style={{
                    backgroundColor: '#f0f9ff', 
                    padding: '8px', 
                    margin: '10px 0', 
                    borderRadius: '4px',
                    maxHeight: '250px',
                    overflow: 'auto',
                    minWidth: '260px'
                  }}
                  onClick={this.preventPropagation}
                  >
                    {isLoadingDict && (
                      <div className="simple-translate-loading" style={{padding: '10px 0'}}>加载词典中...</div>
                    )}
                    
                    {!isLoadingDict && dictData && isDictDataAvailable && (
                      <>
                        {typeof dictData.ipa === 'string' && dictData.ipa && (
                          <div 
                            className="simple-translate-phonetic" 
                            style={{
                              backgroundColor: '#e6f3ff', 
                              padding: '5px 8px', 
                              marginBottom: (dictData.definitions || dictData.synonyms) ? '10px' : '0', 
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              minWidth: '240px', // 添加最小宽度
                              overflowX: 'hidden' // 防止水平滚动
                            }}
                          >
                            <div style={{
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: '1',
                              minWidth: '0'
                            }}>
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>{dictData.ipa.startsWith('/') ? dictData.ipa : `/${dictData.ipa}/`}</span>
                              {dictData.tts && (
                                <div style={{display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0}}>
                                  <button
                                    onClick={this.playTTS}
                                    disabled={isPlayingAudio}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: isPlayingAudio ? 'default' : 'pointer',
                                      padding: '5px',
                                      fontSize: '1.2em',
                                      color: isPlayingAudio ? '#4CAF50' : '#000',
                                      position: 'relative'
                                    }}
                                    title={isPlayingAudio ? "播放中..." : "播放发音"}
                                  >
                                    {isPlayingAudio ? "🔊" : "🔊"}
                                  </button>
                                  
                                  {audioError && (
                                    <div style={{display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.85em'}}>
                                      <button
                                        onClick={() => this.openDictionaryLink('forvo')}
                                        style={{
                                          border: 'none',
                                          background: 'transparent',
                                          cursor: 'pointer',
                                          color: '#2196F3',
                                          textDecoration: 'underline',
                                          padding: '0 2px'
                                        }}
                                        title="在Forvo中查看发音"
                                      >
                                        Forvo
                                      </button>
                                      <span>|</span>
                                      <button
                                        onClick={() => this.openDictionaryLink('cambridge')}
                                        style={{
                                          border: 'none',
                                          background: 'transparent',
                                          cursor: 'pointer',
                                          color: '#2196F3',
                                          textDecoration: 'underline',
                                          padding: '0 2px'
                                        }}
                                        title="在剑桥词典中查看发音"
                                      >
                                        Camb
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {(dictData.definitions || (dictData.synonyms && dictData.synonyms.length > 0)) && (
                              <span 
                                onClick={this.toggleDictExpand}
                                style={{
                                  cursor: 'pointer',
                                  color: '#2196F3',
                                  fontSize: '0.9em',
                                  padding: '2px 5px',
                                  borderRadius: '3px'
                                }}
                              >
                                {isDictExpanded ? '▼' : '▶'}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* 词典详细内容 */}
                        {isDictExpanded && dictData.definitions && (
                          <div style={{width: '100%'}}>
                            {dictData.definitions.map((def, index) => (
                              <div key={index} className="simple-translate-definition" style={{marginBottom: '8px'}}>
                                {def.partOfSpeech && (
                                  <span className="simple-translate-pos" style={{color: '#666', fontStyle: 'italic', marginRight: '8px'}}>
                                    {def.partOfSpeech}
                                  </span>
                                )}
                                <ol className="simple-translate-meanings" style={{margin: '3px 0', paddingLeft: '20px'}}>
                                  {def.meanings.map((meaning, mIndex) => (
                                    <li key={mIndex} style={{margin: '2px 0', fontSize: '0.95em'}}>{meaning}</li>
                                  ))}
                                </ol>
                                {def.examples && def.examples.length > 0 && (
                                  <div className="simple-translate-examples" style={{borderLeft: '2px solid #e0e0e0', paddingLeft: '8px', margin: '3px 0'}}>
                                    <p className="example-title" style={{color: '#666', margin: '3px 0', fontSize: '0.85em'}}>例句:</p>
                                    <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                                      {def.examples.slice(0, 2).map((example, eIndex) => (
                                        <li key={eIndex} className="example-item" style={{color: '#444', fontStyle: 'italic', margin: '2px 0', fontSize: '0.9em'}}>
                                          {example}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                            
                            {dictData.synonyms && dictData.synonyms.length > 0 && (
                              <div className="simple-translate-synonyms" style={{borderTop: '1px solid #e0e0e0', paddingTop: '6px', marginTop: '6px'}}>
                                <p className="synonyms-title" style={{color: '#666', margin: '0 0 3px 0', fontSize: '0.85em'}}>同义词:</p>
                                <p className="synonyms-content" style={{color: '#2196F3', margin: 0, fontSize: '0.95em'}}>
                                  {dictData.synonyms.join(", ")}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    
                    {!isLoadingDict && hasLoadedPhonetic && !isDictDataAvailable && (
                      <div style={{
                        padding: '5px 8px', 
                        borderRadius: '4px', 
                        backgroundColor: '#f5f5f5', 
                        color: '#666',
                        fontSize: '0.9em',
                        fontStyle: 'italic'
                      }}>
                        暂无此单词的词典数据
                      </div>
                    )}
                  </div>
                )}
                
                {/* 加载中状态 - 在音标加载过程中显示 */}
                {isLoadingPhonetic && (
                  <div className="simple-translate-loading" style={{
                    padding: '8px', 
                    margin: '10px 0',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '4px',
                    fontSize: '0.9em',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    加载音标中...
                  </div>
                )}
              </>
            )}

            {isError && (
              <p className="simple-translate-error" style={{margin: '10px 0 0 0'}}>
                {errorMessage}
                <br />
                <a href={translationApi === "google" ?
                  `https://translate.google.com/?sl=auto&tl=${currentLang}&text=${encodeURIComponent(selectedText)}` :
                  `https://www.deepl.com/translator#auto/${currentLang}/${encodeURIComponent(selectedText)}`
                }
                  target="_blank">
                  {translationApi === "google" ?
                    browser.i18n.getMessage("openInGoogleLabel") :
                    browser.i18n.getMessage("openInDeeplLabel")}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };
}
