
package com.soa.loadbalancer;

import java.time.LocalDateTime;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("backend")
public class BackendController {

    @Value("${app.instance-id:INSTANCE}")
    private String instanceId;

    @GetMapping("/service/info")
    public Map<String, Object> getServiceInfo() {

        return Map.of(
            "message", "Request processed successfully",
            "instance", instanceId,
            "service", "SOA Backend Service",
            "status", "UP",
            "timestamp", LocalDateTime.now().toString()
        );
    }

    @GetMapping("/service/health")
    public Map<String, String> health() {

        return Map.of(
            "instance", instanceId,
            "status", "UP"
        );
    }
}
