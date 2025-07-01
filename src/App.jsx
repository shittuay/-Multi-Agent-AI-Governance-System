import React, { useState, useEffect } from 'react';
import { Shield, FileText, Eye, Brain, Lock, CheckCircle, AlertTriangle, MessageCircle, Send, Activity, Wifi, WifiOff, Zap } from 'lucide-react';
import { getBedrockResponse, testBedrockConnection, getModelStats } from './services/bedrockAI.js';

function App() {
  // State management
  const [agents, setAgents] = useState({
    policy: { status: 'active', lastUpdate: new Date(), alerts: 0 },
    compliance: { status: 'monitoring', lastUpdate: new Date(), alerts: 2 },
    audit: { status: 'logging', lastUpdate: new Date(), alerts: 0 },
    ethics: { status: 'evaluating', lastUpdate: new Date(), alerts: 1 },
    privacy: { status: 'protecting', lastUpdate: new Date(), alerts: 0 }
  });

  const [selectedAgent, setSelectedAgent] = useState('policy');
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bedrockConnected, setBedrockConnected] = useState(null);
  const [modelStats, setModelStats] = useState(null);

  // Agent configurations
  const agentConfigs = {
    policy: {
      name: 'Policy Agent',
      icon: FileText,
      color: 'bg-blue-500',
      description: 'Manages governance policies and regulatory frameworks with expertise in GDPR, EU AI Act, CCPA compliance, and cross-jurisdictional regulatory requirements.',
      capabilities: ['Policy Creation & Management', 'Regulatory Framework Mapping', 'GDPR & EU AI Act Compliance', 'Cross-border Regulatory Analysis']
    },
    compliance: {
      name: 'Compliance Agent',
      icon: Shield,
      color: 'bg-green-500',
      description: 'Provides real-time compliance monitoring with automated violation detection, risk assessment, and remediation recommendations across multiple regulatory frameworks.',
      capabilities: ['Real-time Compliance Monitoring', 'Automated Violation Detection', 'Risk Level Assessment', 'GDPR/CCPA Compliance Tracking']
    },
    audit: {
      name: 'Audit Agent',
      icon: Eye,
      color: 'bg-purple-500',
      description: 'Maintains comprehensive audit trails with evidence collection, forensic analysis capabilities, and regulatory audit preparation for all AI governance activities.',
      capabilities: ['Activity Logging & Tracking', 'Evidence Collection & Preservation', 'Forensic Analysis Support', 'Regulatory Audit Preparation']
    },
    ethics: {
      name: 'Ethics Agent',
      icon: Brain,
      color: 'bg-orange-500',
      description: 'Evaluates AI systems for ethical implications, algorithmic bias, fairness across demographic groups, and ensures AI transparency and explainability.',
      capabilities: ['Algorithmic Bias Detection', 'Fairness Analysis & Testing', 'Ethical Impact Assessment', 'AI Transparency & Explainability']
    },
    privacy: {
      name: 'Data Privacy Agent',
      icon: Lock,
      color: 'bg-red-500',
      description: 'Ensures comprehensive data protection compliance with GDPR, CCPA regulations, manages consent mechanisms, and handles data subject rights requests.',
      capabilities: ['GDPR & CCPA Compliance', 'Privacy Impact Assessment', 'Consent Management', 'Data Subject Rights Handling']
    }
  };

  // Test Bedrock connection on component mount
  useEffect(() => {
    const initializeBedrock = async () => {
      console.log("🚀 Initializing AWS Bedrock Claude connection...");
      setBedrockConnected(null); // Show loading state
      
      const connectionTest = await testBedrockConnection();
      setBedrockConnected(connectionTest.success);
      setModelStats(getModelStats());
      
      if (connectionTest.success) {
        console.log("✅ AWS Bedrock Claude AI integration active!");
        console.log("🤖 Using", getModelStats().model, "for AI governance responses");
      } else {
        console.log("⚠️ Bedrock connection failed - using intelligent fallback responses");
        console.error("Connection error:", connectionTest.error);
      }
    };
    
    initializeBedrock();
  }, []);

  // Real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      const agentKeys = Object.keys(agents);
      const randomAgent = agentKeys[Math.floor(Math.random() * agentKeys.length)];
      
      setAgents(prev => ({
        ...prev,
        [randomAgent]: {
          ...prev[randomAgent],
          lastUpdate: new Date()
        }
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Event handlers
  const handleAgentSelect = (agentKey) => {
    console.log('🎯 Agent selected:', agentKey);
    setSelectedAgent(agentKey);
    if (agents[agentKey].alerts > 0) {
      setAgents(prev => ({
        ...prev,
        [agentKey]: { ...prev[agentKey], alerts: 0 }
      }));
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isProcessing) return;

    setIsProcessing(true);
    const userMessage = {
      id: Date.now(),
      type: 'user',
      message: userInput.trim(),
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = userInput.trim();
    setUserInput('');

    try {
      console.log(`🤖 Getting Claude AI response for ${selectedAgent} agent...`);
      console.log(`📝 User query: "${currentInput}"`);
      
      // Get response from Bedrock Claude AI
      const aiResponseText = await getBedrockResponse(selectedAgent, currentInput, chatMessages);
      
      const agentResponse = {
        id: Date.now() + 1,
        type: 'agent',
        message: aiResponseText,
        agent: agentConfigs[selectedAgent].name,
        timestamp: new Date(),
        source: bedrockConnected ? 'AWS Bedrock Claude' : 'Intelligent Fallback'
      };

      setChatMessages(prev => [...prev, agentResponse]);
      console.log(`✅ ${agentResponse.source} response delivered`);
      
    } catch (error) {
      console.error('❌ Error getting AI response:', error);
      
      // Error fallback
      const errorResponse = {
        id: Date.now() + 1,
        type: 'agent',
        message: "I'm experiencing technical difficulties connecting to the AI service. Please try again in a moment, or check the console for details.",
        agent: agentConfigs[selectedAgent].name,
        timestamp: new Date(),
        source: 'Error Handler'
      };
      
      setChatMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getTotalAlerts = () => {
    return Object.values(agents).reduce((total, agent) => total + agent.alerts, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                🛡️ Multi-Agent AI Governance System
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                Ensuring regulatory compliance, data privacy, and ethical AI usage
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">System Status</div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-600 font-medium">Operational</span>
                </div>
              </div>
              
              {/* Bedrock AI Status Indicator */}
              <div className="text-right">
                <div className="text-sm text-gray-500">AI Engine</div>
                <div className="flex items-center space-x-2">
                  {bedrockConnected === null ? (
                    <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                  ) : bedrockConnected ? (
                    <Zap className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  )}
                  <span className={`font-medium text-sm ${
                    bedrockConnected === null ? 'text-yellow-600' :
                    bedrockConnected ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {bedrockConnected === null ? 'Connecting...' :
                     bedrockConnected ? 'Claude AI Active' : 'Fallback Mode'}
                  </span>
                </div>
              </div>
              
              {getTotalAlerts() > 0 && (
                <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                  {getTotalAlerts()} alerts
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* System Overview */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">System Overview</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Overall Compliance</p>
                  <p className="text-3xl font-bold text-gray-900">94%</p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <Shield className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Policies</p>
                  <p className="text-3xl font-bold text-gray-900">24</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Audit Events (24h)</p>
                  <p className="text-3xl font-bold text-gray-900">1,247</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Activity className="h-8 w-8 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Risk Level</p>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-600">
                    Medium
                  </span>
                </div>
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Agent Dashboard */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">AI Governance Agents</h2>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                Currently Selected: <span className="font-semibold text-blue-600">{agentConfigs[selectedAgent].name}</span>
              </div>
              {modelStats && (
                <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-lg border">
                  Powered by {modelStats.model}
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(agentConfigs).map(([key, config]) => {
              const agent = agents[key];
              const IconComponent = config.icon;
              const isSelected = selectedAgent === key;
              
              return (
                <div
                  key={key}
                  className={`relative rounded-lg shadow-md p-6 cursor-pointer transition-all duration-300 transform ${
                    isSelected 
                      ? 'bg-blue-50 border-2 border-blue-500 shadow-xl scale-105 ring-4 ring-blue-200' 
                      : 'bg-white border border-gray-200 hover:shadow-lg hover:-translate-y-1'
                  }`}
                  onClick={() => handleAgentSelect(key)}
                >
                  {agent.alerts > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold animate-pulse">
                      {agent.alerts}
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1 shadow-lg">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${config.color} shadow-md`}>
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  
                  <div className="mb-4">
                    <h3 className={`text-lg font-semibold mb-1 ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                      {config.name}
                    </h3>
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                      isSelected 
                        ? 'bg-blue-200 text-blue-800 border-blue-300' 
                        : 'bg-green-100 text-green-700 border-green-200'
                    }`}>
                      {agent.status}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex justify-between items-center">
                      <span>Last Update:</span>
                      <span className="font-medium">
                        {agent.lastUpdate.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span>Status:</span>
                      <span className="font-medium capitalize">Operational</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Agent Details Panel */}
          <div className="bg-white rounded-lg shadow-lg border-2 border-blue-200">
            <div className="p-6 border-b border-gray-200 bg-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-lg ${agentConfigs[selectedAgent].color} shadow-lg`}>
                    {React.createElement(agentConfigs[selectedAgent].icon, {
                      className: "h-8 w-8 text-white"
                    })}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {agentConfigs[selectedAgent].name}
                    </h2>
                    <p className="text-lg text-gray-600">
                      Status: <span className="capitalize font-medium text-green-600">{agents[selectedAgent].status}</span>
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowChat(!showChat)}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-lg flex items-center space-x-2"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>{showChat ? 'Hide Chat' : 'Chat with AI'}</span>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">📋 AI Agent Description</h3>
                <p className="text-gray-700 text-lg leading-relaxed bg-gray-50 p-4 rounded-lg border">
                  {agentConfigs[selectedAgent].description}
                </p>
              </div>
              
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">🔧 Core AI Capabilities</h3>
                <div className="grid grid-cols-1 gap-3">
                  {agentConfigs[selectedAgent].capabilities.map((capability, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
                      <span className="text-sm font-medium text-gray-700">{capability}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="bg-white rounded-lg shadow-lg">
            {showChat ? (
              <>
                <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                      <MessageCircle className="h-5 w-5 text-blue-600" />
                      <span>AI Chat with {agentConfigs[selectedAgent].name}</span>
                    </h3>
                    {bedrockConnected && (
                      <div className="flex items-center space-x-2 text-sm text-green-600">
                        <Zap className="h-4 w-4" />
                        <span>Claude AI Active</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-96 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="flex items-center justify-center mb-4">
                        <div className={`p-4 rounded-full ${agentConfigs[selectedAgent].color}`}>
                          {React.createElement(agentConfigs[selectedAgent].icon, {
                            className: "h-8 w-8 text-white"
                          })}
                        </div>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">
                        Ready for AI Governance Consultation
                      </h4>
                      <p className="text-gray-500 mb-4">
                        Ask the {agentConfigs[selectedAgent].name} about compliance, policies, or governance matters
                      </p>
                      <div className="grid grid-cols-1 gap-2 max-w-md mx-auto">
                        {[
                          "What are our GDPR compliance requirements?",
                          "Analyze our AI bias detection protocols",
                          "Generate an audit report summary"
                        ].map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => setUserInput(suggestion)}
                            className="text-left p-3 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                          >
                            💭 "{suggestion}"
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                            msg.type === 'user'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{msg.message}</p>
                          <div className="flex justify-between items-center mt-2">
                            <p className="text-xs opacity-75">
                              {msg.timestamp.toLocaleTimeString()}
                            </p>
                            {msg.source && msg.type === 'agent' && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                msg.source.includes('Claude') ? 'bg-green-200 text-green-700' :
                                msg.source === 'Intelligent Fallback' ? 'bg-yellow-200 text-yellow-700' :
                                'bg-red-200 text-red-700'
                              }`}>
                                {msg.source}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-800 px-4 py-3 rounded-lg max-w-xs">
                        <div className="flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                          <span className="text-xs text-gray-600">
                            {bedrockConnected ? 'Claude AI thinking...' : 'AI processing...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={`Ask ${agentConfigs[selectedAgent].name} about governance, compliance, or regulations...`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isProcessing}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!userInput.trim() || isProcessing}
                      className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {bedrockConnected ? '🤖 Powered by Claude AI via AWS Bedrock' : '⚠️ Running in fallback mode'}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className={`p-4 rounded-full ${agentConfigs[selectedAgent].color}`}>
                    {React.createElement(agentConfigs[selectedAgent].icon, {
                      className: "h-8 w-8 text-white"
                    })}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  AI-Powered Governance Assistant
                </h3>
                <p className="text-gray-600 mb-4">
                  Start an intelligent conversation with the {agentConfigs[selectedAgent].name} powered by Claude AI
                </p>
                <button
                  onClick={() => setShowChat(true)}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center space-x-2 mx-auto"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>Start AI Chat</span>
                </button>
                {modelStats && (
                  <p className="text-xs text-gray-500 mt-4">
                    Powered by {modelStats.model} • {modelStats.estimatedCost} per interaction
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;