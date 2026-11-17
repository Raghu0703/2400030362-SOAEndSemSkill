
package com.soa.loadbalancer;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("gateway")
@RequestMapping("/api/service")
public class GatewayController {

    // Three backend instances
    private final List<String> instances = List.of(
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8083"
    );

    // Round Robin counter
    private final AtomicInteger counter = new AtomicInteger(0);

    // HTTP client
    private final HttpClient client = HttpClient.newHttpClient();

    @GetMapping("/**")
    public ResponseEntity<String> routeRequest(
            HttpServletRequest request) {

        // Select next backend instance
        int index = Math.floorMod(
            counter.getAndIncrement(),
            instances.size()
        );

        String selectedInstance = instances.get(index);

        try {

            // Remove /api prefix
            String backendPath = request.getRequestURI()
                                        .substring(4);

            String query = request.getQueryString();

            String targetUrl = selectedInstance + backendPath;

            if (query != null) {
                targetUrl += "?" + query;
            }

            // Create backend HTTP request
            HttpRequest backendRequest = HttpRequest.newBuilder()
                .uri(URI.create(targetUrl))
                .GET()
                .build();

            // Send request
            HttpResponse<String> backendResponse =
                client.send(
                    backendRequest,
                    HttpResponse.BodyHandlers.ofString()
                );

            System.out.println(
                "Request routed to: " + selectedInstance
            );

            // Return backend response
            return ResponseEntity
                .status(backendResponse.statusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(backendResponse.body());

        } catch (Exception e) {

            System.out.println("Gateway error: " + e.getMessage());

            return ResponseEntity
                .status(503)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":\"Backend service unavailable\"}");
        }
    }
}

