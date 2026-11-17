# SOA Lab Experiment: Round Robin Load Balancing at API Gateway

## 1. Aim of the Experiment
To design, implement, and verify **Round Robin Load Balancing at an API Gateway** to manage and distribute incoming HTTP traffic across **three backend service instances** in a Service-Oriented Architecture (SOA).

---

## 2. Architecture & Components

```
                      +-----------------------------+
                      |       Client / Consumer     |
                      +-----------------------------+
                                     |
                                     | HTTP Requests (e.g. GET /api/data)
                                     v
                      +-----------------------------+
                      |   API Gateway (Port 8080)   |
                      | - Reverse Proxy Router      |
                      | - Round Robin Algorithm     |
                      | - Background Health Checker |
                      +-----------------------------+
                                /    |    \
          Request 1, 4, 7...   /     |     \  Request 3, 6, 9...
                              /      |      \
                             /  Request 2, 5, 8...
                            v        v        v
                   +------------+ +------------+ +------------+
                   | Instance 1 | | Instance 2 | | Instance 3 |
                   | Port: 5001 | | Port: 5002 | | Port: 5003 |
                   |   (Alpha)  | |   (Beta)   | |   (Gamma)  |
                   +------------+ +------------+ +------------+
```

### Components:
1. **Three Backend Service Instances (`backend-services/instance.js`)**:
   - **Instance 1**: Port `5001` (`Service-Alpha`)
   - **Instance 2**: Port `5002` (`Service-Beta`)
   - **Instance 3**: Port `5003` (`Service-Gamma`)
   - Each instance maintains internal request counters and reports health via `/health`.
2. **API Gateway (`gateway/gateway.js`)**:
   - Listens on Port `8080`.
   - Intercepts requests matching `/api/*`.
   - Selects the next healthy target using the Round Robin mathematical algorithm.
   - Forwards request body, headers, and query parameters via reverse proxy.
   - Attaches tracing response headers (`X-Forwarded-To-Instance`, `X-Forwarded-To-Port`, `X-Load-Balancer`, `X-Gateway-Latency-Ms`).
3. **Round Robin Router (`gateway/roundRobinRouter.js`)**:
   - Circular index pointer:
     $$\text{selectedTarget} = \text{healthyTargets}[\text{currentIndex} \pmod{\text{totalHealthy}}]$$
     $$\text{currentIndex} = (\text{currentIndex} + 1) \pmod{\text{totalHealthy}}$$
4. **Health Checker (`gateway/healthCheck.js`)**:
   - Continuously probes backend instances. If an instance goes down, it is dynamically excluded from the round-robin cycle without dropping incoming requests.
5. **Interactive Web Dashboard (`public/dashboard.html`)**:
   - Real-time visualization of traffic balance, live request counters, and failure simulation at `http://127.0.0.1:8080/dashboard`.
6. **Automated Verifier (`tests/verify-distribution.js`)**:
   - Sends sequential test requests through the Gateway, verifies exact rotation sequence, and validates mathematical distribution.

---

## 3. Directory Structure

```
soaendlab/
├── backend-services/
│   └── instance.js             # Microservice instance implementation
├── gateway/
│   ├── roundRobinRouter.js     # Round Robin selection & statistics
│   ├── healthCheck.js          # Dynamic instance health monitoring
│   └── gateway.js              # Reverse proxy API Gateway server
├── public/
│   └── dashboard.html          # Real-time visual dashboard for lab demo
├── tests/
│   └── verify-distribution.js  # Automated verification test suite
├── experiment.js               # Master orchestrator script
├── package.json
└── README.md                   # Lab manual and documentation
```

---

## 4. How to Run the Experiment

### Option A: Complete All-in-One Execution (Recommended)
Run the orchestrator script which boots all 3 instances, initializes the Gateway, and executes the verification test automatically:

```bash
npm start
# OR
node experiment.js
```

### Option B: Step-by-Step Manual Execution (For Lab Viva)

#### Step 1: Start the Three Backend Instances in separate terminals:
```bash
# Terminal 1 (Instance 1)
node backend-services/instance.js 5001 Instance-1 Service-Alpha

# Terminal 2 (Instance 2)
node backend-services/instance.js 5002 Instance-2 Service-Beta

# Terminal 3 (Instance 3)
node backend-services/instance.js 5003 Instance-3 Service-Gamma
```

#### Step 2: Start the API Gateway:
```bash
# Terminal 4
node gateway/gateway.js
```

#### Step 3: Run the Verification Test Suite:
```bash
# Terminal 5
node tests/verify-distribution.js
```

#### Step 4: Open the Visual Dashboard in your browser:
Navigate to:
```
http://127.0.0.1:8080/dashboard
```

---

## 5. Verification & Expected Output

### Phase 1: Sequential Request Log
When 15 requests are sent through `http://127.0.0.1:8080/api/data`, the Gateway distributes them in strict rotation:

```
Request # 1 -> Routed to: [Instance-1] on Port :5001 (Latency: 1ms) [HTTP 200]
Request # 2 -> Routed to: [Instance-2] on Port :5002 (Latency: 1ms) [HTTP 200]
Request # 3 -> Routed to: [Instance-3] on Port :5003 (Latency: 1ms) [HTTP 200]
Request # 4 -> Routed to: [Instance-1] on Port :5001 (Latency: 1ms) [HTTP 200]
Request # 5 -> Routed to: [Instance-2] on Port :5002 (Latency: 1ms) [HTTP 200]
Request # 6 -> Routed to: [Instance-3] on Port :5003 (Latency: 1ms) [HTTP 200]
...
Request #15 -> Routed to: [Instance-3] on Port :5003 (Latency: 1ms) [HTTP 200]
```

### Phase 2: Distribution Metrics Table
```
+------------+------------+---------------+----------------+
| Instance   | Port       | Requests Rcvd | Traffic Share  |
+------------+------------+---------------+----------------+
| Instance-1 | :5001      |             5 |          33.3% |
| Instance-2 | :5002      |             5 |          33.3% |
| Instance-3 | :5003      |             5 |          33.3% |
+------------+------------+---------------+----------------+
| TOTAL      |            |            15 |        100.0%  |
+------------+------------+---------------+----------------+

🎯 RESULT: PASS
Load balance verification succeeded: perfectly distributed 33.33% across all 3 instances!
```

---

## 6. Fault Tolerance & Dynamic Failover Test

1. Click **"Simulate Instance 2 Crash"** on the dashboard (or send `POST http://127.0.0.1:5002/api/simulate/crash`).
2. The Gateway health checker marks `Instance-2` as **DOWN**.
3. Next requests are smoothly balanced **50% / 50%** between `Instance-1` and `Instance-3` only.
4. Click **"Recover Instance 2"** (or send `POST http://127.0.0.1:5002/api/simulate/recover`).
5. Gateway restores `Instance-2` to the pool and resumes equal **33.3% / 33.3% / 33.3%** distribution.

---

## 7. Key Viva Questions and Answers

**Q1: What is an API Gateway in SOA?**  
*Answer:* An API Gateway acts as a single unified entry point for all client requests in a microservice or SOA ecosystem. It handles cross-cutting concerns like reverse-proxy routing, load balancing, protocol transformation, authentication, rate limiting, and monitoring.

**Q2: What is the Round Robin load balancing algorithm?**  
*Answer:* Round Robin is a scheduling algorithm that distributes client requests sequentially and cyclically across a list of available service instances in order $(1, 2, 3, \dots, N, 1, 2, \dots)$. It assumes all backend servers have approximately equal processing capacity and that requests impose similar computational load.

**Q3: How does the Gateway detect and handle server crashes?**  
*Answer:* Via background health probing (`GET /health`). When an instance fails to respond or returns an error status, it is temporarily removed from the active rotation pool, ensuring that client requests do not encounter HTTP 502/504 errors.

**Q4: What is the difference between Layer 4 and Layer 7 Load Balancing?**  
*Answer:* 
- **Layer 4 (Transport layer - TCP/UDP)**: Balances traffic based solely on IP addresses and TCP/UDP ports without inspecting application content.
- **Layer 7 (Application layer - HTTP/HTTPS)**: Inspects HTTP headers, URLs, cookies, and payloads to make intelligent routing decisions (like path-based routing `/api/*`). This lab implements Layer 7 load balancing.
