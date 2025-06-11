"use client";
// export const dynamic = "force-dynamic";
import dynamic from "next/dynamic";

import { useState, useEffect, useRef } from "react";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });
// import Plotly from "plotly.js";
import { Button, Checkbox, Col, Divider, Form, InputNumber, Layout, List, Tooltip, Radio, Row, Select, Space, Switch, Typography} from 'antd';

import 'katex/dist/katex.min.css';
import TeX from '@matejmazur/react-katex';
const { Header, Content, Footer } = Layout;
const { Title, Paragraph } = Typography;
const { Option } = Select;

function formatCentralTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', // Central Time Zone
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export default function Home() {
  const [ovenArduino, setOvenArduino] = useState({
    Port: "",
    Manufacturer: "Arduino LLC (www.arduino.cc)",
    VID: "2341",
    PID: "0043",
  });
  const [isListening, setIsListening] = useState(false);
  const [rampStatus, setRampStatus] = useState("Idle");
  const [rampComplete, setRampComplete] = useState(false);
  const [PWMData, setPWMData] = useState({ x: [], I: [], y: [] });
  const [VData, setVData] = useState({ x: [], y: [] });
  const [PData, setPData] = useState({ x: [], y: [] });
  const [displayData, setDisplayData] = useState({ Vx: [], Vy: [], Ix: [], Iy: [], Px: [], Py: [] });
  const [PWM2I, setPWM2I] = useState( { k: 0.0154, b: 0.005 });
  const [rampForm] = Form.useForm();
  const [PIDForm] = Form.useForm();
  const [refresh, setRefresh] = useState(false);
  const [PID, setPID] = useState(false);
  const [quote, setQuote] = useState("");
  const [clearPlots, setClearPlots] = useState(false);
  const [stabParams, setStabParams] = useState({ setpoint: 1, range: 5 });
  const [maxPower, setMaxPower] = useState(25);
  const [maxPowerForm, setMaxPowerForm] = useState("");
  const [flag, setFlag] = useState(false);
  const [interlockOn, setInterlockOn] = useState(false);
  const [flowmeterWarning, setFlowmeterWarning] = useState(false);
  const [PIDCommandLoading, setPIDCommandLoading] = useState(false);
  const [rampCommandLoading, setRampCommandLoading] = useState(false);
  const [dataBin, setDataBin] = useState(1);

  const eventSourceRef = useRef(null);
  const iPlotRef = useRef(null);
  const vPlotRef = useRef(null);
  const pPlotRef = useRef(null);
  const maxPRef = useRef(null);

  function calculateTickValues(data, numTicks) {
    let x = dataBin === 1 ? data.bin_1.x : dataBin === 10 ? data.bin_10.x : data.bin_100.x;
    if (x.length === 0) return []; // No data, no ticks
  
    const start = x[0];
    const end = x[x.length - 1];
    const step = (end - start) / (numTicks - 1);
  
    // Generate evenly spaced tick values
    return Array.from({ length: numTicks }, (_, i) => start + i * step).forEach(e => new Date(e));
  }

  const combinedImageDownload = async () => {
    const Plotly = await import("plotly.js-dist-min")
    const refs = [iPlotRef, vPlotRef, pPlotRef];
    const plotNodes = refs.map((ref) => {
      if (ref.current) {
        return ref.current.querySelector(".js-plotly-plot");
      }
      return null;
    });
    const images = await Promise.all(
      plotNodes.map((node) =>
        Plotly.toImage(node, { format: "png", height: 400, width: 400 })
      ))
  
    const canvas = document.createElement("canvas");
    canvas.width = 1200; // Combined width of 3 plots (adjust as needed)
    canvas.height = 400; // Height of a single plot
  
    const ctx = canvas.getContext("2d");
  
    for (let i = 0; i < images.length; i++) {
      const img = new Image();
      img.src = images[i];
      await new Promise((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, i * 400, 0, 400, 400); // Draw each image side by side
          resolve();
        };
      });
    }
  
    // Trigger download
    const link = document.createElement("a");
    const now = new Date();
    link.download = `IVP_${formatCentralTime(now)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  useEffect(() => {
    fetch('http://api.quotable.io/random?tags=science')
      .then((response) => response.json())
      .then((data) => {
        setQuote({ text: data.content, author: data.author });
      })
      .catch((error) => console.error('Error fetching quote:', error));
    // Fetch serial ports on page load and find the oven Arduino
    async function fetchPorts() {
      try {
        const response = await fetch("/api/listPorts");
        const data = await response.json();
        data.forEach((port) => {
          if (port.vendorId === ovenArduino.VID && port.productId === ovenArduino.PID) {
            setOvenArduino({ ...ovenArduino, Port: port.path });
          }
        });
        if (data.length === 0) {
          console.error("No serial ports found");
          setOvenArduino({ ...ovenArduino, Port: "" });
        }
      } catch (error) {
        console.error("Failed to fetch ports:", error);
      }
    }
    fetchPorts();
  }, [refresh]);

  useEffect(() => {
    maxPRef.current = maxPower;
  }, [maxPower]);

  useEffect(() => {
    if (dataBin === 1) {
      setDisplayData({ Vx: VData.x, Vy: VData.y, Ix: PWMData.x, Iy: PWMData.I, Px: PData.x, Py: PData.y });
    } else if (dataBin === 10) {
      setDisplayData({ Vx: binData(VData.x, 10), Vy: binData(VData.y, 10), Ix: binData(PWMData.x, 10), Iy: binData(PWMData.I, 10), Px: binData(PData.x, 10), Py: binData(PData.y, 10) });
    } else if (dataBin === 100) {
      setDisplayData({ Vx: binData(VData.x, 100), Vy: binData(VData.y, 100), Ix: binData(PWMData.x, 100), Iy: binData(PWMData.I, 100), Px: binData(PData.x, 100), Py: binData(PData.y, 100) });
    }}, [PWMData]);

  const binData = (data, binSize) => {
    const numBins = Math.ceil(data.length / binSize);
    const binnedData = Array.from({ length: numBins }, (_, i) => {
      const start = i * binSize;
      const end = start + binSize;
      return data.slice(start, end)[0];
    });
    return binnedData;
  }

  const startListening = () => {
    if (!ovenArduino.Port) {
      console.error("No port selected for the oven Arduino");
      return;
    }

    const eventSource = new EventSource(`/api/streamPort?port=${ovenArduino.Port}`);
    setIsListening(true);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const line = event.data;
      console.log("Received data:", line);
      const currentTime = new Date(); // Get the current time
      const statePattern = /^%%\w$/;
      const dataPattern = /^(I)(\d+)(P)(\d+)(M)(\d+)$/;
      const PIDPattern = /^(S)(-?\d+(?:\.\d+)?)(R)(-?\d+(?:\.\d+)?)$/;
      if (statePattern.test(line)) {
        let parsedValue = line.toString().match(/%%\w/)[0].slice(2);
        if (parsedValue === "U") {
          setRampStatus("Ramping Up");
          setRampComplete(false);
        } else if (parsedValue === "D") {
          setRampStatus("Ramping Down");
          setRampComplete(false);
        } else if (parsedValue === "C") {
          setRampComplete(true);
        } else if (parsedValue === "P") {
          setPID(true);
          console.log("PID On");
        } else if (parsedValue === "p") {
          setPID(false);
          console.log("PID Off");
        } else if (parsedValue === "F") {
          setFlowmeterWarning(true);
          setInterlockOn(true);
          console.log("Flowmeter Warning");
        }
      } else if (dataPattern.test(line)) {
        let match = line.toString().match(dataPattern);
        const PWM = parseInt(match[2], 10); 
        const sensedP = parseInt(match[4], 10);
        const sensedM = parseInt(match[6], 10);
        const current = PWM2I.k * parseInt(PWM, 10) + PWM2I.b;
        const trueP = 2.5 / 1023 * sensedP * 16;
        const trueM = 2.5 / 1023 * sensedM * 19;
        const trueV = trueP - trueM;
        const power = trueV * current;
        setPWMData(prev => ({
          ...prev,
          x: [...prev.x, currentTime], 
          I: [...prev.I, current],
          y: [...prev.y, PWM],
        }));
        setVData((prev) => ({
          ...prev, 
          x: [...prev.x, currentTime],
          y: [...prev.y, trueV],
        }));
        setPData((prev) => ({
          ...prev,
          x: [...prev.x, currentTime],
          y: [...prev.y, power],  
        }));
        if (power > maxPRef.current) {
          console.log("Power exceeds max power, zeroing current");
          setInterlockOn(true);
          sendCommand("U 0 1 0");
        }
      } else if (PIDPattern.test(line)) {
        let match = line.toString().match(PIDPattern);
        const setpoint = parseFloat(match[2], 10);
        const range = parseFloat(match[4], 10) * 100;
        setStabParams({ setpoint, range });
      } else {
        console.log("Unknown data:", line);
      }
    }
    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      setIsListening(false);
      eventSource.close();
      setOvenArduino({ ...ovenArduino, Port: "" });
    };

      return () => eventSource.close(); // Cleanup when component unmounts or listening stops
  };

  const stopListening = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close(); // Close the EventSource connection
      eventSourceRef.current = null; // Clear the ref
    }
    setIsListening(false);
  };

  const tryBlock = async (command) => {
    const response = await fetch("/api/streamPort", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command }),
    });

    if (!response.ok) {
      throw new Error("Failed to send command");
    }
    console.log("Command sent successfully");
  }

  const sendCommand = async (emergencyCommand=undefined) => {
    if (!ovenArduino.Port) {
      console.error("No port selected for the oven Arduino");
      return;
    }
    let command;
    if (emergencyCommand) {
      command = emergencyCommand;
    } else {
      const { mode, start, period, target } = rampForm.getFieldsValue();
      command = `${mode} ${start} ${period} ${target}`;
      console.log(command)
    }
    try { tryBlock(command); } catch (error) {
      console.error("Failed to send command:", error);
    }
  }

  const sendPIDCommand = async () => {
    if (!ovenArduino.Port) {
      console.error("No port selected for the oven Arduino");
      return;
    }
    let mode = !PID;
    setPID(mode);
    let command = mode ? "P" : "p";;
    try { tryBlock(command); } catch (error) {
      console.error("Failed to send command:", error);
    }
  }

  const sendPIDParams = async () => {
    if (!ovenArduino.Port) {
      console.error("No port selected for the oven Arduino");
      return;
    }
    // console.log(sendPIDCommandRef.current)
    const { setpoint, range } = PIDForm.getFieldsValue();
    console.log(setpoint, range);
    let command = `s ${setpoint} ${range}`;
    try {
      tryBlock(command); 
    } catch (error) {
      console.error("Failed to send command:", error);
    } 
  }

  const downloadCSV = () => {
    if (!PWMData || !VData || !PData || PWMData.x.length === 0 || VData.x.length === 0 || PData.x.length === 0) {
      console.error("No data to download");
      return;
    }
    // Step 1: Create CSV string
    const csvHeader = `Time [s],PWM [a.u.], I=${PWM2I.k}*PWM+${PWM2I.b} [A], V [V], P=VI [W]\n`; // CSV header
    const rowCount = PWMData.x.length; // Assume all `x` vectors are the same length
    const csvRows = Array.from({ length: rowCount }, (_, i) => {
      return [
        PWMData.x[i], 
        PWMData.y[i], 
        PWM2I.k * PWMData.y[i] + PWM2I.b,
        VData.y[i], 
        PData.y[i], 
      ].join(","); // Join values with commas
    }).join("\n"); // Join rows with newlines
  
    const csvContent = csvHeader + csvRows;
  
    // Step 2: Create a Blob from the string
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
  
    // Step 3: Create a link and trigger the download
    const link = document.createElement("a");
    link.href = url;
    link.download = "data.csv"; // File name
    link.click();
  
    // Cleanup
    URL.revokeObjectURL(url);
  };
  
  const clearData = () => {
    setPWMData({ x: [], I: [], y: [] });
    setVData({ x: [], y: [] });
    setPData({ x: [], y: [] });
    setClearPlots(false);
  }

  useEffect(() => { setFlag(true) }, [])

  return (
    <Layout>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
      }}>
        <Col span={16}>
        <Paragraph
          style={{
            textAlign: 'center', 
            margin: '20px 0', 
            fontStyle: 'italic',
            color: 'white',
          }}
        >{quote.text}</Paragraph>
        </Col>
        <Col span={8}>
        <Paragraph
          style={{
            textAlign: 'center', 
            margin: '20px 0', 
            fontStyle: 'italic',
            color: 'white',
          }}
        >- {quote.author}</Paragraph>
        </Col>
      </Header>
      <Content>
        <Row>
          <Col span={2}/>
          <Col span={14}>
            <Row>
              <Col span={14}>
                <Title level={3}>Oven Servo Arduino Information</Title>
                <List>
                  <strong>Port:</strong> {ovenArduino.Port} <br />
                  <strong>Manufacturer:</strong> {ovenArduino.Manufacturer || "Unknown"} <br />
                  <strong>VID:</strong> {ovenArduino.VID || "N/A"} <br />
                  <strong>PID:</strong> {ovenArduino.PID || "N/A"}
                </List>
                <Row justify="center" align="middle">
              <Col>
                <Button 
                  disabled={!ovenArduino.Port}
                  onClick={isListening ? stopListening : startListening}
                >
                  {isListening ? "Stop Listening" : "Start Listening"}
                </Button>
              </Col>
              <Col>
                <Button onClick={() => setRefresh(!refresh)}>
                  Refresh Ports
                </Button>
              </Col>
                </Row>
                <Row>
                <Col span={8}>
                <Title level={3}>Status:</Title>
                </Col>
                <Col span={16}>
                  {interlockOn ? 
                    <Title level={4} style={{ color: "red" }}>
                      {"Interlock On" + (flowmeterWarning ? " (FM)" : " (P)")}
                    </Title> :
                    <Title level={4} style={{ color: isListening ? "green" : "red" }}>
                    {isListening ? "Online, " + rampStatus : "Offline"}{rampComplete && isListening ? " Complete" : ""}
                    </Title>  
                  }
                </Col>
                </Row>
                <Row>
                <Col span={8}>
                  <Row>
                    <Tooltip
                        title={"The Arduino will zero the current if the detected power exceeds this value."}
                        placement="bottom"
                      >
                      <Title level={3}>
                        Max Power:
                      </Title>
                    </Tooltip>
                  </Row>
                </Col>
                <Col span={4}>
                  <Title level={4}>{maxPower} W</Title>
                </Col>
                <Col span={12}>
                    <Tooltip 
                      title={<TeX math="\mathbb{R}\in[0,30]" />}
                      placement="right"
                    >
                      <InputNumber 
                        value={maxPowerForm}
                        style={{
                          width: '60%',
                        }}
                        step={0.1}
                        precision={1} // Restrict decimal places
                        min={0}
                        max={30}
                        onChange={(value) => setMaxPowerForm(value)}
                      />
                    </Tooltip>
                  <Button
                    type="primary"
                    disabled={!flag || maxPowerForm === ""}
                    onClick={() => setMaxPower(maxPowerForm)}
                  >
                    Set Max Power
                  </Button>
                </Col>
                </Row>
              </Col>
              <Col span={10}>
                <Title level={3}>Power Stabilization</Title>
                <List>
                  <strong>Current power setpoint:</strong> {stabParams.setpoint}W <br />
                  <strong>Current stabilization range:</strong> {stabParams.range}% <br />
                </List>
                <Form
                  form={PIDForm}
                >
                  <Form.Item
                    label="Setpoint [W]"
                    name="setpoint"
                    rules={[
                      {
                        required: true,
                        message: 'Please input!',
                      },
                    ]}
                  >
                    <Tooltip 
                      title={<TeX math="\mathbb{R}\in[0,30]" />}
                      placement="right"
                    >
                      <InputNumber
                        style={{
                          width: '90%',
                        }}
                        step={0.01}
                        precision={2} // Restrict decimal places
                        min={0}
                        max={30}
                        onChange={(value) => PIDForm.setFieldsValue({ setpoint: value })}
                      />
                    </Tooltip>
                  </Form.Item>
                  <Form.Item
                    label="Range [%]"
                    name="range"
                    rules={[
                      {
                        required: true,
                        message: 'Please input!',
                      },
                    ]}
                  >
                    <Tooltip
                      title={<TeX math="\mathbb{Z}\in[0,100]" />}
                      placement="right"
                    >
                      <InputNumber
                        style={{
                          width: '90%',
                        }}
                        precision={0} // Restrict decimal places
                        formatter={(value) => (value ? `${Math.floor(value)}` : "")} // Display as integer
                        parser={(value) => value.replace(/\D/g, "")} // Parse and remove non-digits
                        min={0}
                        max={20}
                        onChange={(value) => PIDForm.setFieldsValue({ range: value })}
                      />
                    </Tooltip>
                  </Form.Item>
                  <Form.Item
                    wrapperCol={{
                      offset: 6,
                      span: 16,
                    }}
                  >
                    <Button
                      type="primary"
                      disabled={!isListening || PIDForm.getFieldValue("setpoint") === undefined || PIDForm.getFieldValue("setpoint") === null || PIDForm.getFieldValue("range") === undefined || PIDForm.getFieldValue("range") === null}
                      onClick={() => {
                        setPIDCommandLoading(true)
                        sendPIDParams()
                        setTimeout(() => {
                          setPIDCommandLoading(false)
                        }, 2000);
                      }}
                      loading={PIDCommandLoading}
                    >
                      Set Parameters
                    </Button>
                  </Form.Item>
                  <Form.Item
                    wrapperCol={{
                      offset: 6,
                      span: 16,
                    }}
                  >
                    <Tooltip 
                      title={rampComplete && isListening && rampStatus === "Ramping up" ? "" : "Power stabilization can only be enabled after a ramp-up is complete."}
                      placement="right"
                    >
                      <Switch 
                        checkedChildren="Stabilization On" 
                        unCheckedChildren="Stabilization Off" 
                        defaultChecked={false} 
                        disabled={!isListening || !rampComplete || rampStatus !== "Ramping Up"}
                        onChange={() => sendPIDCommand()}
                        value={PID}
                      />
                    </Tooltip>
                  </Form.Item>
                </Form>
              </Col>
            </Row>
          </Col>
          <Col span={6}>
            <Title level={3}>Oven Command</Title>
            <Form form={rampForm}>
                <Form.Item
                  label="Select Mode"
                  name="mode"
                  rules={[
                    {
                      required: true,
                      message: 'Please input!',
                    },
                  ]}
                >
                  <Select
                    onChange={() => setRefresh(!refresh)}
                  >
                    <Option value="U">Ramp up</Option>
                    <Option value="D">Ramp down</Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  label="Starting PWM Value"
                  name="start"
                  rules={[
                    {
                      required: rampForm.getFieldValue("mode") === "U",
                      message: 'Please input!',
                    },
                  ]}
                >
                  <Tooltip
                    title={<TeX math="\mathbb{Z}\in[0,255]" />}
                    placement="right"
                  >
                    <InputNumber
                      style={{
                        width: '100%',
                      }}
                      precision={0} // Restrict decimal places
                      formatter={(value) => (value ? `${Math.floor(value)}` : "")} // Display as integer
                      parser={(value) => value.replace(/\D/g, "")} // Parse and remove non-digits
                      min={0}
                      max={255}
                      onChange={(value) => rampForm.setFieldsValue({ start: value })}
                      disabled={rampForm.getFieldValue("mode") === "D"}
                    />
                  </Tooltip>
                </Form.Item>
                <Form.Item
                  label="Seconds per step"
                  name="period"
                  rules={[
                    {
                      required: rampForm.getFieldValue("mode") === "U",
                      message: 'Please input!',
                    },
                  ]}
                >
                  <Tooltip
                    title={<TeX math="\mathbb{Z}\in[0,999]" />}
                    placement="right"
                  >
                    <InputNumber
                      style={{
                        width: '100%',
                      }}
                      precision={0} // Restrict decimal places
                      formatter={(value) => (value ? `${Math.floor(value)}` : "")} // Display as integer
                      parser={(value) => value.replace(/\D/g, "")} // Parse and remove non-digits
                      min={0}
                      max={999}
                      onChange={(value) => rampForm.setFieldsValue({ period: value })}
                      disabled={rampForm.getFieldValue("mode") === "D"}
                    />
                  </Tooltip>
                </Form.Item>
                <Form.Item
                  label="Target PWM Value"
                  name="target"
                  rules={[
                    {
                      required: rampForm.getFieldValue("mode") === "U",
                      message: 'Please input!',
                    },
                  ]}
                >
                  <Tooltip
                    title={<TeX math="\mathbb{Z}\in[0,255]" />}
                    placement="right"
                  >
                    <InputNumber
                      style={{
                        width: '100%',
                      }}
                      precision={0} // Restrict decimal places
                      formatter={(value) => (value ? `${Math.floor(value)}` : "")} // Display as integer
                      parser={(value) => value.replace(/\D/g, "")} // Parse and remove non-digits
                      min={0}
                      max={255}
                      onChange={(value) => rampForm.setFieldsValue({ target: value })}
                      disabled={rampForm.getFieldValue("mode") === "D"}
                    />
                  </Tooltip>
                </Form.Item>
                <Form.Item
                  wrapperCol={{
                    offset: 6,
                    span: 16,
                  }}
                >
                  <Tooltip 
                    title={isListening ? "" : "Make sure the oven is connected and listening."}
                    placement="right" 
                  >
                    <Button 
                      type="primary" 
                      htmlType="submit"
                      onClick={() => {
                        setRampCommandLoading(true)
                        sendCommand()
                        setInterlockOn(false)
                        setTimeout(() => {
                          setRampCommandLoading(false)
                        }, 2000);
                      }}
                      disabled={!isListening}
                      loading={rampCommandLoading}
                    >
                      Send Command
                    </Button>
                  </Tooltip>
                </Form.Item>
            </Form>
          </Col>
          <Col span={2}/>
        </Row>
        <Divider />
        <Row justify="center">
          <Space>
          <Button 
              type="primary" 
              onClick={downloadCSV}
          >
              Download CSV
          </Button>
          <Divider type="vertical" style={{ height: "40px" }}/>
          <Button
              type="primary"
              onClick={() => combinedImageDownload()}
          >
            Download Three Images as One
          </Button>
          <Divider type="vertical" style={{ height: "40px" }}/>
          <Paragraph
            style={{
              marginBottom: '0px',
            }}
          >
            <Checkbox checked={clearPlots} onChange={() => setClearPlots(!clearPlots)}>Can clear data</Checkbox>
          </Paragraph>
          <Button 
            type="primary" 
            onClick={clearData}
            disabled={!clearPlots}
          >
            Clear data
          </Button>
          <Divider type="vertical" style={{ height: "40px" }}/>
          <Paragraph strong>Data Bin Size:</Paragraph>
          <Radio.Group 
            label="Data Binning" 
            value={dataBin} 
            onChange={(e) => setDataBin(e.target.value)}
          >
            <Radio.Button value={1}>1</Radio.Button>
            <Radio.Button value={10}>10</Radio.Button>
            <Radio.Button value={100}>100</Radio.Button>
          </Radio.Group>
          </Space>
        </Row>
        <Row>
          <Col span={8}>
            <div ref={vPlotRef}>
              <Plot
                data={[
                  {
                    x: displayData.Vx,
                    y: displayData.Vy,
                    type: "scatter",
                    mode: "lines+markers",
                    marker: { color: "blue" },
                  },
                ]}
                layout={{
                  title: "Oven Voltage vs Time",
                  xaxis: { 
                    title: "Time",
                    // tickmode: "array",
                    // tickvals: calculateTickValues(VData, 5),
                  },
                  yaxis: { title: "Voltage [V]" },
                }}
                style={{ width: "100%", height: "400px" }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div ref={iPlotRef}>
              <Plot
                data={[
                  {
                    x: displayData.Ix,
                    y: displayData.Iy,
                    type: "scatter",
                    mode: "lines+markers",
                    marker: { color: "red" },
                  },
                ]}
                layout={{
                  title: "Oven Current vs Time",
                  xaxis: { 
                    title: "Time",
                    // tickmode: "array",
                    // tickvals: calculateTickValues(PWMData, 5),
                  },
                  yaxis: { title: "Current [A]" },
                }}
                style={{ width: "100%", height: "400px" }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div ref={pPlotRef}>
              <Plot
                data={[
                  {
                    x: displayData.Px,
                    y: displayData.Py,
                    type: "scatter",
                    mode: "lines+markers",
                    marker: { color: "purple" },
                  },
                ]}
                layout={{
                  title: "Oven Power vs Time",
                  xaxis: { 
                    title: "Time",
                    // tickmode: "array",
                    // tickvals: calculateTickValues(PWMData, 5),
                  },
                  yaxis: { title: "Power [W]" },
                }}
                style={{ width: "100%", height: "400px" }}
              />
            </div>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
