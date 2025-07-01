import React, { useState, useEffect } from 'react';
import { Shield, FileText, Eye, Brain, Lock, CheckCircle, AlertTriangle, MessageCircle, Send, Filter, Download, Search, Calendar, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

const GovernanceSystem = () => {
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

  // Agent configurations
  const agentConfigs = {
    policy: {
      name: 'Policy Agent',
      icon: FileText,
      color: 'bg-blue-500',
      description: 'Manages governance policies and regulatory frameworks',
      capabilities: ['Policy Creation', 'Regulatory Mapping', 'Compliance Standards', 'Framework Updates']
    },
    compliance: {
      name: 'Compliance Agent',
      icon: Shield,
      color: 'bg-green-500',
      description: 'Monitors adherence to regulations and internal policies',
      capabilities: ['Real-time Monitoring', 'Violation Detection', 'Risk Assessment', 'Remediation Suggestions']
    },
    audit: {
      name: 'Audit Agent',
      icon: Eye,
      color: 'bg-purple-500',
      description: 'Comprehensive logging and audit trail management',
      capabilities: ['Activity Logging', 'Audit Reports', 'Evidence Collection', 'Forensic Analysis']
    },
    ethics: {
      name: 'Ethics Agent',
      icon: Brain,
      color: 'bg-orange-500',
      description: 'Evaluates AI decisions for ethical implications and bias',
      capabilities: ['Bias Detection', 'Fairness Analysis', 'Ethical Guidelines', 'Impact Assessment']
    },
    privacy: {
      name: 'Data Privacy Agent',
      icon: Lock,
      color: 'bg-red-500',
      description: 'Ensures data protection and privacy compliance',
      capabilities: ['Data Classification', 'Access Control', 'Privacy Impact', 'Consent Management']
    }
  };

  // Sample data
  const policies = [
    { id: 1, name: 'Data Retention Policy', status: 'active', compliance: 95, lastReview: '2025-06-28' },
    { id: 2, name: 'AI Fairness Standards', status: 'active', compliance: 88, lastReview: '2025-06-30' },
    { id: 3, name: 'Privacy Protection Rules', status: 'active', compliance: 97, lastReview: '2025-06-29' },
    { id: 4, name: 'Algorithmic Transparency', status: 'review', compliance: 72, lastReview: '2025-06-25' }
  ];

  const auditLogs = [
    { id: 1, timestamp: new Date(), agent: 'Ethics Agent', action: 'Bias Detection Scan', result: 'Passed', risk: 'Low' },
    { id: 2, timestamp: new Date(Date.now() - 300000), agent: 'Privacy Agent', action: 'Data Access Request', result: 'Approved', risk: 'Medium' },
    { id: 3, timestamp: new Date(Date.now() - 600000), agent: 'Compliance Agent', action: 'GDPR Compliance Check', result: 'Warning', risk: 'High' },
    { id: 4, timestamp: new Date(Date.now() - 900000), agent: 'Policy Agent', action: 'Policy Update', result: 'Implemented', risk: 'Low' }
  ];

  // Agent responses
  const getAgentResponse = (agentKey, message) => {
    const responses = {
      policy: [
        "I've reviewed the current regulatory landscape. GDPR compliance is at 97%, but we need to update our AI fairness standards.",
        "New policy recommendations: Implement algorithmic impact assessments for high-risk AI systems.",
        "Regulatory update: EU AI Act requirements now mandate human oversight for AI decision-making systems."
      ],
      compliance: [
        "Current compliance status: 2 policy violations detected in the last hour. Initiating automated remediation.",
        "Risk assessment complete: High-risk activities detected in data processing pipeline. Escalating to privacy team.",
        "Compliance monitoring active: All AI systems operating within acceptable risk parameters."
      ],
      audit: [
        "Audit trail complete: 1,247 AI decisions logged in the last 24 hours with full traceability.",
        "Evidence collection in progress: Gathering data for quarterly compliance report.",
        "Anomaly detected: Unusual pattern in AI model predictions requires investigation."
      ],
      ethics: [
        "Bias analysis complete: Detected potential gender bias in recruitment AI model. Confidence: 78%.",
        "Fairness evaluation: AI system shows equitable outcomes across demographic groups.",
        "Ethical review needed: New AI application may impact vulnerable populations."
      ],
      privacy: [
        "Data protection status: All PII encrypted and access-controlled. No privacy violations detected.",
        "Consent verification: 12 users requested data deletion under GDPR Article 17.",
        "Privacy impact assessment: New data collection practice requires user consent updates."
      ]
    };

    return responses[agentKey][Math.floor(Math.random() * responses[agentKey].length)];
  };

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
    console.log('Agent selected:', agentKey); // Debug log
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
    setUserInput('');

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const agentResponse = {
      id: Date.now() + 1,
      type: 'agent',
      message: getAgentResponse(selectedAgent, userInput),
      agent: agentConfigs[selectedAgent].name,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, agentResponse]);
    setIsProcessing(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Helper functions
  const getStatusIcon = (status) => {
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  };

  const getRiskColor = (risk) => {
    const colors = {
      'Low': 'text-green-600 bg-green-100',
      'Medium': 'text-yellow-600 bg-yellow-100',
      'High': 'text-red-600 bg-red-100'
    };
    return colors[risk] || 'text-gray-600 bg-gray-100';
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
              
              {getTotalAlerts() > 0 && (
                <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                  {getTotalAlerts()} alerts
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* System Overview */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">System Overview</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">AI Governance Agents</h2>
            <div className="text-sm text-gray-600 bg-blue-50 px-4 py-2 rounded-lg border">
              Currently Selected: <span className="font-semibold text-blue-600">{agentConfigs[selectedAgent].name}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
                  
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1 shadow-lg">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${config.color} shadow-md`}>
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                    {getStatusIcon(agent.status)}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Agent Details & Chat */}
          <div className="lg:col-span-2 space-y-6">
            {/* Selected Agent Details */}
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
                      <p className="text-sm text-gray-500">
                        Last Update: {agents[selectedAgent].lastUpdate.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setShowChat(!showChat)}
                    className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-lg"
                  >
                    {showChat ? '❌ Hide Chat' : '💬 Chat with Agent'}
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900">📋 Description</h3>
                  <p className="text-gray-700 text-lg leading-relaxed bg-gray-50 p-4 rounded-lg border">
                    {agentConfigs[selectedAgent].description}
                  </p>
                </div>
                
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900">🔧 Core Capabilities</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {agentConfigs[selectedAgent].capabilities.map((capability, index) => (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
                        <span className="text-sm font-medium text-gray-700">{capability}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agent Stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{agents[selectedAgent].alerts || 0}</div>
                    <div className="text-sm text-gray-600">Active Alerts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">24/7</div>
                    <div className="text-sm text-gray-600">Monitoring</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">100%</div>
                    <div className="text-sm text-gray-600">Uptime</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Interface */}
            {showChat && (
              <div className="bg-white rounded-lg shadow-lg">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Chat with {agentConfigs[selectedAgent].name}
                  </h3>
                </div>

                <div className="h-96 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        Start a conversation with the {agentConfigs[selectedAgent].name}
                      </p>
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
                          <p className="text-xs opacity-75 mt-2">
                            {msg.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-800 px-4 py-3 rounded-lg max-w-xs">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-200">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={`Ask ${agentConfigs[selectedAgent].name} about governance...`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isProcessing}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!userInput.trim() || isProcessing}
                      className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Policies Overview */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">Governance Policies</h3>
              <div className="space-y-3">
                {policies.map(policy => (
                  <div key={policy.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-900">{policy.name}</h4>
                      <p className="text-sm text-gray-600">Last review: {policy.lastReview}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-sm font-medium">{policy.compliance}% compliant</p>
                        <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${policy.compliance}%` }}
                          ></div>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        policy.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                      }`}>
                        {policy.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Audit Log Sidebar */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Recent Audit Log</h3>
            <div className="space-y-4">
              {auditLogs.map(log => (
                <div key={log.id} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{log.action}</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(log.risk)}`}>
                      {log.risk}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{log.agent}</p>
                  <p className="text-xs text-gray-500">{log.timestamp.toLocaleString()}</p>
                  <p className={`text-xs mt-1 ${
                    log.result === 'Passed' || log.result === 'Approved' || log.result === 'Implemented' 
                      ? 'text-green-600' 
                      : log.result === 'Warning' 
                        ? 'text-yellow-600' 
                        : 'text-red-600'
                  }`}>
                    Result: {log.result}
                  </p>
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">System Health</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-600">Overall Compliance</span>
                  <span className="text-xs font-medium text-green-600">94%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-600">Active Policies</span>
                  <span className="text-xs font-medium">24</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-600">Audit Events (24h)</span>
                  <span className="text-xs font-medium">1,247</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-600">Risk Level</span>
                  <span className="text-xs font-medium text-yellow-600">Medium</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GovernanceSystem;